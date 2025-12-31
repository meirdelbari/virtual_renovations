// Supplier Admin page
// Auth: uses same "x-user-id" header as supplier portal (prototype auth).
// Access control is enforced on the server via SUPPLIER_ADMIN_USER_IDS or SUPPLIER_ADMIN_KEY.

let clerk;
let currentUser = null;

function setLoadingError(message, details = "") {
  const el = document.getElementById("loading");
  if (!el) return;
  el.innerHTML = `
    <div class="text-center text-red-600">
      <p class="font-semibold">${message}</p>
      ${details ? `<p class="mt-2 text-sm text-gray-600">${details}</p>` : ""}
      <button onclick="location.reload()" class="mt-4 text-indigo-600 underline">Reload</button>
    </div>
  `;
}

async function apiCall(endpoint, method = "GET", body = null) {
  const headers = {
    "Content-Type": "application/json",
    "x-user-id": currentUser ? currentUser.id : "",
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`/api/suppliers${endpoint}`, options);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Server returned non-JSON: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `API Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function ensureClerk(publishableKey) {
  if (!publishableKey) throw new Error("Missing Clerk publishable key");

  // Load Clerk script only after key is known
  if (!window.Clerk || typeof window.Clerk.load !== "function") {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-clerk-publishable-key", publishableKey);
      script.onload = resolve;
      script.onerror = () => reject(new Error("Failed to load Clerk script"));
      document.head.appendChild(script);
    });
  }

  clerk = window.Clerk;
  await clerk.load({ publishableKey });
}

function mountUserButton() {
  const el = document.getElementById("user-button");
  if (!el) return;
  if (clerk && clerk.mountUserButton) clerk.mountUserButton(el);
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function badge(status) {
  const base = "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold";
  if (status === "approved") return `${base} bg-green-100 text-green-800`;
  if (status === "rejected") return `${base} bg-red-100 text-red-800`;
  if (status === "active") return `${base} bg-green-100 text-green-800`;
  if (status === "blocked") return `${base} bg-red-100 text-red-800`;
  return `${base} bg-yellow-100 text-yellow-800`; // pending/default
}

function setTableHead(mode) {
  const row = document.getElementById("table-head-row");
  if (!row) return;
  if (mode === "suppliers") {
    row.innerHTML = `
      <th class="text-left p-3">Company</th>
      <th class="text-left p-3">Email</th>
      <th class="text-left p-3">Status</th>
      <th class="text-left p-3">Created</th>
      <th class="text-left p-3">Reason</th>
      <th class="text-right p-3">Actions</th>
    `;
  } else {
    row.innerHTML = `
      <th class="text-left p-3">Product</th>
      <th class="text-left p-3">Supplier</th>
      <th class="text-left p-3">Status</th>
      <th class="text-left p-3">Created</th>
      <th class="text-left p-3">Reason</th>
      <th class="text-right p-3">Actions</th>
    `;
  }
}

async function loadSuppliers() {
  try {
    const status = document.getElementById("status-filter").value;
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const suppliers = await apiCall(`/admin/suppliers${qs}`);

    document.getElementById("total-count").textContent = String(suppliers.length);

    const tbody = document.getElementById("rows");
    tbody.innerHTML = "";

    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr><td class="p-4 text-gray-500" colspan="6">No suppliers found.</td></tr>`;
      return;
    }

    suppliers.forEach((s) => {
      const tr = document.createElement("tr");
      tr.className = "border-t";
      const portalHref = `supplier.html?adminSupplierId=${encodeURIComponent(s.id)}`;
      tr.innerHTML = `
      <td class="p-3 font-medium text-gray-900">
        <a class="text-indigo-600 hover:underline" href="${portalHref}" target="_blank" rel="noopener noreferrer">
          ${s.companyName || ""}
        </a>
      </td>
      <td class="p-3 text-gray-700">${s.contactEmail || ""}</td>
      <td class="p-3"><span class="${badge(s.status || "active")}">${s.status || "active"}</span></td>
      <td class="p-3 text-gray-700">${formatDate(s.createdAt)}</td>
      <td class="p-3 text-gray-600">${s.statusReason || ""}</td>
      <td class="p-3 text-right">
        <div class="inline-flex gap-2">
          ${
            (s.status || "active") === "blocked"
              ? `<button class="unblock-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold" data-id="${s.id}">Unblock</button>`
              : `<button class="block-btn bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold" data-id="${s.id}">Block</button>`
          }
        </div>
      </td>
    `;
      tbody.appendChild(tr);
    });

    // Bind events
    document.querySelectorAll(".block-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const reason = prompt("Block reason (optional):") || "";
        btn.disabled = true;
        try {
          await apiCall(`/admin/suppliers/${encodeURIComponent(id)}/block`, "POST", { reason });
          await loadSuppliers();
        } catch (e) {
          alert(e.message);
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll(".unblock-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await apiCall(`/admin/suppliers/${encodeURIComponent(id)}/unblock`, "POST");
          await loadSuppliers();
        } catch (e) {
          alert(e.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    // Surface authz problems loudly
    if (e && e.status === 403) {
      setLoadingError(
        "Admin access required",
        "Your Clerk user is signed in, but not allowlisted as a supplier admin. Add SUPPLIER_ADMIN_USER_IDS in Vercel and redeploy."
      );
    } else {
      setLoadingError("Failed to load suppliers", e?.message || String(e));
    }
    throw e;
  }
}

async function loadProducts() {
  try {
    const status = document.getElementById("status-filter").value;
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    const products = await apiCall(`/admin/products${qs}`);

    document.getElementById("total-count").textContent = String(products.length);
    const tbody = document.getElementById("rows");
    tbody.innerHTML = "";

    if (products.length === 0) {
      tbody.innerHTML = `<tr><td class="p-4 text-gray-500" colspan="6">No products found.</td></tr>`;
      return;
    }

    products.forEach((p) => {
      const tr = document.createElement("tr");
      tr.className = "border-t";
      const portalHref = `supplier.html?adminSupplierId=${encodeURIComponent(p.supplierId || "")}`;
      tr.innerHTML = `
        <td class="p-3 font-medium text-gray-900">${p.name || ""}<div class="text-xs text-gray-500">${p.category || ""}</div></td>
        <td class="p-3 text-gray-700">
          ${p.supplierId ? `<a class="text-indigo-600 hover:underline" href="${portalHref}" target="_blank" rel="noopener noreferrer">${p.supplierName || ""}</a>` : (p.supplierName || "")}
        </td>
        <td class="p-3"><span class="${badge(p.status || "pending")}">${p.status || "pending"}</span></td>
        <td class="p-3 text-gray-700">${formatDate(p.createdAt)}</td>
        <td class="p-3 text-gray-600">${p.statusReason || ""}</td>
        <td class="p-3 text-right">
          <div class="inline-flex gap-2">
            <button class="prod-approve-btn bg-green-600 text-white px-3 py-1 rounded text-xs font-semibold" data-id="${p.id}">Approve</button>
            <button class="prod-reject-btn bg-red-600 text-white px-3 py-1 rounded text-xs font-semibold" data-id="${p.id}">Reject</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    document.querySelectorAll(".prod-approve-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await apiCall(`/admin/products/${encodeURIComponent(id)}/approve`, "POST");
          await loadProducts();
        } catch (e) {
          alert(e.message);
        } finally {
          btn.disabled = false;
        }
      });
    });

    document.querySelectorAll(".prod-reject-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const reason = prompt("Reject reason (optional):") || "";
        btn.disabled = true;
        try {
          await apiCall(`/admin/products/${encodeURIComponent(id)}/reject`, "POST", { reason });
          await loadProducts();
        } catch (e) {
          alert(e.message);
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    if (e && e.status === 403) {
      setLoadingError(
        "Admin access required",
        "Your Clerk user is signed in, but not allowlisted as a supplier admin. Add SUPPLIER_ADMIN_USER_IDS in Vercel and redeploy."
      );
    } else {
      setLoadingError("Failed to load products", e?.message || String(e));
    }
    throw e;
  }
}

async function init() {
  try {
    const res = await fetch("/api/auth-config");
    const config = await res.json();
    await ensureClerk(config.publishableKey);

    if (!clerk.user) {
      document.getElementById("loading").innerHTML = `
        <div class="text-center">
          <p class="mb-4 text-gray-600">Please sign in to access Supplier Admin.</p>
          <button id="login-btn" class="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium">Sign In</button>
        </div>
      `;
      document.getElementById("login-btn").addEventListener("click", () => {
        clerk.openSignIn({ afterSignInUrl: window.location.href, afterSignUpUrl: window.location.href });
      });
      return;
    }

    currentUser = clerk.user;
    mountUserButton();

    const viewSelect = document.getElementById("admin-view");
    const statusSelect = document.getElementById("status-filter");

    const refresh = async () => {
      const mode = viewSelect ? viewSelect.value : "products";
      setTableHead(mode);
      if (mode === "suppliers") {
        await loadSuppliers();
      } else {
        await loadProducts();
      }
    };

    document.getElementById("refresh-btn").addEventListener("click", refresh);
    statusSelect.addEventListener("change", refresh);
    if (viewSelect) viewSelect.addEventListener("change", refresh);

    // Load data first; only then reveal the UI so failures aren't silent
    await refresh();

    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    setLoadingError("Failed to load admin.", e.message || String(e));
  }
}

init();


