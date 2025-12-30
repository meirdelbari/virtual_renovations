const Stripe = require("stripe");
const { clerkClient } = require("@clerk/clerk-sdk-node");

// Initialize Stripe
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
} else {
  console.warn("STRIPE_SECRET_KEY not set. Payment features will be disabled.");
}

// Pricing Configuration
const PRICING = {
  credits: {
    small: {
      name: "Small Credit Pack (20 Credits)",
      amount: 1500, // $15.00
      credits: 20,
    },
    large: {
      name: "Large Credit Pack (100 Credits)",
      amount: 6000, // $60.00
      credits: 100,
    },
  },
  subscription: {
    starter: {
      priceId: process.env.STRIPE_PRICE_ID_STARTER, // $19/mo
      credits: 50,
    },
    pro: {
      priceId: process.env.STRIPE_PRICE_ID_PRO, // $49/mo
      credits: 200,
    },
    enterprise: {
      priceId: process.env.STRIPE_PRICE_ID_ENTERPRISE, // $199/mo
      credits: 1000,
    },
  },
};

/**
 * Create a Stripe Checkout Session
 */
async function createCheckoutSession({ userId, userEmail, planType, planId, returnUrl }) {
  if (!stripe) {
    throw new Error("Stripe is not configured on the server.");
  }
  if (!userId || !planType || !planId) {
    throw new Error("Missing required parameters");
  }

  let lineItems = [];
  let mode = "payment";
  let metadata = {
    userId,
    planType, // 'credits' or 'subscription'
    planId,   // 'small', 'starter', etc.
  };

  if (planType === "credits") {
    const pack = PRICING.credits[planId];
    if (!pack) throw new Error("Invalid credit pack");

    lineItems.push({
      price_data: {
        currency: "usd",
        product_data: {
          name: pack.name,
          description: "One-time purchase of credits for Virtual Renovations",
        },
        unit_amount: pack.amount,
      },
      quantity: 1,
    });
    mode = "payment";
  } else if (planType === "subscription") {
    const sub = PRICING.subscription[planId];
    if (!sub || !sub.priceId) throw new Error("Invalid subscription plan or missing Price ID");

    lineItems.push({
      price: sub.priceId,
      quantity: 1,
    });
    mode = "subscription";
  } else {
    throw new Error("Invalid plan type");
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: lineItems,
    mode: mode,
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl,
    customer_email: userEmail,
    metadata: metadata,
  });

  return session;
}

/**
 * Handle Stripe Webhook Events
 */
async function handleWebhook(body, signature) {
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    throw new Error(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe event: ${event.type}`);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    await fulfillOrder(session);
  }

  return { received: true };
}

/**
 * Fulfill the order: Add credits to user
 */
async function fulfillOrder(session) {
  const { userId, planType, planId } = session.metadata;

  console.log(`Fulfilling order for User ${userId}: ${planType} - ${planId}`);

  let creditsToAdd = 0;

  if (planType === "credits") {
    const pack = PRICING.credits[planId];
    if (pack) creditsToAdd = pack.credits;
  } else if (planType === "subscription") {
    const sub = PRICING.subscription[planId];
    if (sub) creditsToAdd = sub.credits;
  }

  if (creditsToAdd > 0) {
    await addCreditsToUser(userId, creditsToAdd);
  }
}

/**
 * Add credits to a user's Clerk metadata
 */
async function addCreditsToUser(userId, amount) {
  try {
    const user = await clerkClient.users.getUser(userId);
    const currentCredits = user.privateMetadata.credits || 0;
    const newBalance = currentCredits + amount;

    await clerkClient.users.updateUser(userId, {
      privateMetadata: {
        ...user.privateMetadata,
        credits: newBalance,
      },
    });

    console.log(`Added ${amount} credits to user ${userId}. New balance: ${newBalance}`);
  } catch (error) {
    console.error("Failed to update user credits in Clerk:", error);
    throw error; // Rethrow to let webhook retry if needed
  }
}

/**
 * Check if user has enough credits and deduct one
 */
async function deductCredit(userId, amount = 1) {
  // If no userId (e.g. demo mode), maybe allow or block. 
  // Assuming auth is required.
  if (!userId) throw new Error("User ID required");

  const user = await clerkClient.users.getUser(userId);
  const currentCredits = user.privateMetadata.credits || 0;

  if (currentCredits < amount) {
    return false; // Not enough credits
  }

  // Deduct
  await clerkClient.users.updateUser(userId, {
    privateMetadata: {
      ...user.privateMetadata,
      credits: currentCredits - amount,
    },
  });

  return true;
}

/**
 * Get user credit balance
 */
async function getUserCredits(userId) {
  const user = await clerkClient.users.getUser(userId);
  return user.privateMetadata.credits || 0;
}

module.exports = {
  createCheckoutSession,
  handleWebhook,
  deductCredit,
  getUserCredits,
  PRICING
};

