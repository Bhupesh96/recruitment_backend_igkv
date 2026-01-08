window.addEventListener("load", () => {
  setTimeout(initPremiumApiSaver, 900);
});

function initPremiumApiSaver() {
  const sections = document.querySelectorAll(".opblock-tag-section");

  sections.forEach((section) => {
    const title = section.querySelector(".opblock-tag").innerText.trim();
    const storageKey = "savedApis_" + title.replace(/\s+/g, "_");
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");

    if (section.querySelector(".premium-api-saver")) return;

    // MAIN BOX
    const box = document.createElement("div");
    box.className = "premium-api-saver";

    box.innerHTML = `
      <div class="api-header">
        <h3>${title} – Saved APIs</h3>

        <button class="toggle-form-btn icon-btn" title="Register API">➕</button>
      </div>

      <div class="api-form hide">
        <div class="form-row">
          <label>API Name</label>
          <input class="api-name" placeholder="Enter name" />
        </div>

        <div class="form-row">
          <label>API URL</label>
          <input class="api-url" placeholder="https://example.com/api" />
        </div>

        <div class="form-row">
          <label>Parameters (JSON)</label>
          <textarea class="api-params" placeholder='{"key":"value"}'></textarea>
        </div>

        <div class="form-row">
          <label>Payload (JSON)</label>
          <textarea class="api-body" placeholder='{"body":"sample"}'></textarea>
        </div>

        <button class="save-api-btn icon-btn-green" title="Save">💾 Save</button>
      </div>

      <div class="api-list"></div>
    `;

    section.appendChild(box);

    const form = box.querySelector(".api-form");
    const toggleBtn = box.querySelector(".toggle-form-btn");
    const listEl = box.querySelector(".api-list");

    // FORM EXPAND/COLLAPSE
    toggleBtn.onclick = () => {
      form.classList.toggle("hide");
      toggleBtn.textContent = form.classList.contains("hide") ? "➕" : "⬇️";
    };

    // SAVE API
    box.querySelector(".save-api-btn").onclick = () => {
      const name = form.querySelector(".api-name").value.trim();
      const url = form.querySelector(".api-url").value.trim();
      const params = form.querySelector(".api-params").value.trim();
      const body = form.querySelector(".api-body").value.trim();

      if (!name || !url) return alert("API Name and URL required");

      saved.push({
        name,
        url,
        params: params || "{}",
        payload: body || "{}",
      });

      localStorage.setItem(storageKey, JSON.stringify(saved));
      renderList();
      form.reset();
      form.classList.add("hide");
      toggleBtn.textContent = "➕";
    };

    // RENDER LIST
    function renderList() {
      if (saved.length === 0) {
        listEl.innerHTML = `<p class="empty">No saved APIs.</p>`;
        return;
      }

      listEl.innerHTML = saved
        .map(
          (api, i) => `
        <div class="api-card">
          <div class="api-card-header">
            <span class="api-title">${api.name}</span>

            <div class="api-actions">
              <button class="edit-btn icon-btn-small" data-i="${i}" title="Edit">✏️</button>
              <button class="delete-btn icon-btn-small" data-i="${i}" title="Delete">🗑️</button>
              <button class="expand-btn icon-btn-small" data-i="${i}" title="Expand">➤</button>
            </div>
          </div>

          <div class="api-details hide">
            <p><strong>URL:</strong> ${api.url}</p>

            <p><strong>Params:</strong></p>
            <pre class="json">${api.params}</pre>

            <p><strong>Payload:</strong></p>
            <pre class="json">${api.payload}</pre>
          </div>
        </div>
      `
        )
        .join("");

      // EDIT
      listEl.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.onclick = () => {
          const i = btn.dataset.i;
          const api = saved[i];

          form.querySelector(".api-name").value = api.name;
          form.querySelector(".api-url").value = api.url;
          form.querySelector(".api-params").value = api.params;
          form.querySelector(".api-body").value = api.payload;

          saved.splice(i, 1);
          localStorage.setItem(storageKey, JSON.stringify(saved));
          renderList();

          form.classList.remove("hide");
          toggleBtn.textContent = "⬇️";
        };
      });

      // DELETE
      listEl.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.onclick = () => {
          const i = btn.dataset.i;
          saved.splice(i, 1);
          localStorage.setItem(storageKey, JSON.stringify(saved));
          renderList();
        };
      });

      // EXPAND
      listEl.querySelectorAll(".expand-btn").forEach((btn) => {
        btn.onclick = () => {
          const card = btn.closest(".api-card");
          const details = card.querySelector(".api-details");
          details.classList.toggle("hide");
          btn.textContent = details.classList.contains("hide") ? "➤" : "⬇️";
        };
      });
    }

    renderList();
  });

  injectStyles();
}

// PREMIUM CLEAN CSS
function injectStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    .premium-api-saver {
      margin:20px 0;
      background:#fff;
      border:1px solid #e3e3e3;
      padding:20px;
      border-radius:12px;
    }

    .api-header {
      display:flex;
      justify-content:space-between;
      align-items:center;
    }

    .icon-btn, .icon-btn-green, .icon-btn-small {
      border:none;
      cursor:pointer;
      background:#f4f4f4;
      font-size:16px;
      padding:6px 10px;
      border-radius:6px;
      transition:0.2s;
    }

    .icon-btn:hover, .icon-btn-green:hover, .icon-btn-small:hover {
      background:#e6e6e6;
    }

    .icon-btn-green {
      background:#dff7df;
      font-size:15px;
      margin-top:10px;
    }

    .api-form.hide { display:none; }

    .form-row {
      margin-bottom:12px;
      display:flex;
      flex-direction:column;
    }

    .form-row input, .form-row textarea {
      border:1px solid #ccc;
      border-radius:6px;
      padding:8px;
      font-size:14px;
    }

    .api-card {
      border:1px solid #ddd;
      padding:15px;
      border-radius:10px;
      margin-bottom:14px;
      background:#fafafa;
    }

    .api-card-header {
      display:flex;
      justify-content:space-between;
      align-items:center;
    }

    .api-title {
      font-weight:600;
      font-size:16px;
    }

    .json {
      background:#1e1e1e;
      color:#fff;
      padding:10px;
      border-radius:6px;
      white-space:pre-wrap;
      font-size:13px;
    }

    .hide { display:none; }
  `;
  document.body.appendChild(style);
}
