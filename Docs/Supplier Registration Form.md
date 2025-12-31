# Supplier Registration Form

## URL

- Production: `https://www.algoreitai.com/supplier.html`
- Local: `http://localhost:4000/supplier.html`

## How to reach the registration form

The registration form appears **only** when the signed-in Clerk user **does not yet have a supplier profile**.

### Steps

1. Open the Supplier Portal:
   - `https://www.algoreitai.com/supplier.html`
2. If you are not signed in, click **Sign In / Sign Up** and create a Clerk user account.
3. If your user does **not** have a supplier profile yet, you will see the **Register Company** form:
   - Company Name
   - Contact Person
   - Contact Email
   - Phone
   - Website
   - Address
   - Main Categories
4. Submit the form to create your supplier profile.

## Required fields

All fields in the supplier registration form are **required**.

## Why you might not see the form

- **Already registered as a supplier**: the portal will open the supplier dashboard directly.
- **Still logged in as an existing supplier user**: sign out and sign in with a different/new user.

### Quick reset to see the form again

- Open an **Incognito / Private** window and go to:
  - `https://www.algoreitai.com/supplier.html`
- Sign up with a new email, or sign in with a user that does not have a supplier profile yet.

## What happens after registration

- Supplier registration does **not** require admin approval.
- When the supplier adds a new product, the product is created with status **pending** and requires admin approval before it appears in the public catalog.


