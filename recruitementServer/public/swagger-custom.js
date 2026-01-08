/* ---------------------------------------------------------
   PREMIUM SWAGGER API SAVER – FULL VERSION
   Features:
   ✔ Per-module saved APIs
   ✔ Edit / Delete / Expand (smooth, one open at a time)
   ✔ Copy URL / Params / Payload (with feedback)
   ✔ Global Search (below Servers)
   ✔ Global Backup & Restore
   ✔ Fill saved API → Swagger endpoint (Option A)
   ✔ Premium UI (SVG Icons + dialogs)
----------------------------------------------------------*/

// ---------------- PREMIUM SVG ICONS ----------------
const IC = {
  plus: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M12 5v14M5 12h14" stroke-width="2"/>
    </svg>`,
  down: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M6 9l6 6 6-6" stroke-width="2"/>
    </svg>`,
  save: `
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M5 13l4 4L19 7" stroke-width="2"/>
    </svg>`,
  edit: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4Z" stroke-width="2"/>
    </svg>`,
  delete: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M3 6h18" stroke-width="2"/>
      <path d="M8 6V4h8v2" stroke-width="2"/>
      <path d="M19 6l-1 14H6L5 6" stroke-width="2"/>
    </svg>`,
  expand: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M9 6l6 6-6 6" stroke-width="2"/>
    </svg>`,
  copy: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <rect x="9" y="9" width="13" height="13" rx="2" stroke-width="2"/>
      <rect x="3" y="3" width="13" height="13" rx="2" stroke-width="2"/>
    </svg>`,
  download: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M12 5v12M6 13l6 6 6-6" stroke-width="2"/>
    </svg>`,
  upload: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M12 19V7M6 11l6-6 6 6" stroke-width="2"/>
    </svg>`,
  fill: `
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none">
      <path d="M8 7h8v2H8z" stroke-width="2"/>
      <path d="M12 5v10" stroke-width="2"/>
      <rect x="5" y="15" width="14" height="4" rx="1.5" stroke-width="2"/>
    </svg>`,
};

window.addEventListener("load", () => {
  setTimeout(() => {
    initGlobalControls(); // backup, restore, search
    initPremiumApiSaver(); // per-module API saver
  }, 900);
});

let editingIndex = null;

/* ===================== PREMIUM DELETE CONFIRM ===================== */
function showConfirmDialog({ title, message, onConfirm }) {
  const old = document.getElementById("custom-confirm-dialog");
  if (old) old.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "custom-confirm-dialog";

  wrapper.innerHTML = `
    <div class="confirm-overlay"></div>

    <div class="confirm-box">
      <h3 class="confirm-title">${title}</h3>
      <p class="confirm-msg">${message}</p>

      <div class="confirm-actions">
        <button class="confirm-btn cancel-btn">Cancel</button>
        <button class="confirm-btn delete-btn">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(wrapper);

  wrapper.querySelector(".cancel-btn").onclick = () => wrapper.remove();

  wrapper.querySelector(".delete-btn").onclick = () => {
    wrapper.remove();
    onConfirm();
  };
}

/* ===================== FILL → SWAGGER ===================== */

// Open modal to choose endpoint
function openFillModal(savedApi) {
  const opblocks = Array.from(document.querySelectorAll(".opblock"));
  if (!opblocks.length) {
    alert("No endpoints found in Swagger UI.");
    return;
  }

  const old = document.getElementById("fill-to-swagger-modal");
  if (old) old.remove();

  const wrapper = document.createElement("div");
  wrapper.id = "fill-to-swagger-modal";

  const itemsHtml = opblocks
    .map((op, idx) => {
      const method =
        op.querySelector(".opblock-summary-method")?.innerText.trim() || "";
      const path =
        op.querySelector(".opblock-summary-path")?.innerText.trim() || "";
      const desc =
        op.querySelector(".opblock-summary-description")?.innerText.trim() ||
        "";

      return `
        <li class="fill-endpoint-item" data-i="${idx}">
          <div class="fe-line">
            <span class="fe-method fe-method-${method.toLowerCase()}">${method}</span>
            <span class="fe-path">${path}</span>
          </div>
          ${desc ? `<div class="fe-desc">${desc}</div>` : ""}
        </li>
      `;
    })
    .join("");

  wrapper.innerHTML = `
    <div class="fill-overlay"></div>
    <div class="fill-box">
      <div class="fill-header">
        <h3>Fill saved API into endpoint</h3>
        <button class="fill-close-btn" title="Close">✕</button>
      </div>
      <p class="fill-subtitle">Select an endpoint where you want to apply params & payload.</p>
      <ul class="fill-endpoint-list">
        ${itemsHtml}
      </ul>
    </div>
  `;

  document.body.appendChild(wrapper);

  wrapper.querySelector(".fill-close-btn").onclick = () => wrapper.remove();
  wrapper.querySelector(".fill-overlay").onclick = () => wrapper.remove();

  wrapper.querySelectorAll(".fill-endpoint-item").forEach((li) => {
    li.onclick = () => {
      const idx = parseInt(li.dataset.i, 10);
      const targetOpblock = opblocks[idx];
      fillSavedApiIntoOpblock(savedApi, targetOpblock);
      wrapper.remove();
    };
  });
}

/* ===================== REACT STATE HELPER ===================== */
// Forces React to recognize the value change
function changeReactValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(
    element.constructor.prototype,
    "value"
  );
  const nativeSetter = descriptor ? descriptor.set : null;

  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

/* ===================== UPDATED FILL LOGIC ===================== */
/* ===================== ROBUST REACT SETTER ===================== */
function setNativeValue(element, value) {
  const { set: valueSetter } =
    Object.getOwnPropertyDescriptor(element, "value") || {};
  const prototype = Object.getPrototypeOf(element);
  const { set: prototypeValueSetter } =
    Object.getOwnPropertyDescriptor(prototype, "value") || {};

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
  } else if (valueSetter) {
    valueSetter.call(element, value);
  } else {
    element.value = value;
  }

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

/* ===================== MAIN FILL FUNCTION ===================== */
function fillSavedApiIntoOpblock(savedApi, opblock) {
  console.log("🚀 Starting Smart Fill for:", savedApi.name);

  if (!opblock) return console.error("❌ Opblock not found");

  // 1. Expand & Click Try Out
  if (!opblock.classList.contains("is-open")) {
    opblock.querySelector(".opblock-summary")?.click();
  }

  const tryBtn = opblock.querySelector(".try-out__btn");
  if (tryBtn && !tryBtn.classList.contains("cancel")) {
    tryBtn.click();
  }

  // 2. POLL for inputs (Using broad selector to prevent timeout)
  let attempts = 0;
  const intervalId = setInterval(() => {
    attempts++;

    // Look for ANY visible input/textarea to ensure render is complete
    const inputs = opblock.querySelectorAll("input, textarea, select");

    if (inputs.length > 0) {
      clearInterval(intervalId);
      console.log(`✅ Inputs rendered. Applying Smart Fill...`);
      smartApplyValues(savedApi, opblock);
    } else if (attempts >= 20) {
      clearInterval(intervalId);
      console.warn(
        "⚠️ Timed out. Swagger UI might be lagging or endpoint has no inputs."
      );
    }
  }, 100);
}

/* ===================== SMART APPLY LOGIC ===================== */
/* ===================== SMART APPLY LOGIC (DEBUG & FIX) ===================== */
function smartApplyValues(savedApi, opblock) {
  // 1. Get ALL inputs (not just those in TRs) to be safe
  const allInputs = Array.from(
    opblock.querySelectorAll("input, textarea, select")
  );

  // Debug: Map out what inputs exist to see why we are missing one
  console.log("🔎 Scanning Inputs in DOM:");
  allInputs.forEach((inp) => {
    const row = inp.closest("tr");
    const name = row
      ? row.querySelector(".parameter__name")?.innerText
      : "Unknown (No Row)";
    // clean up name for logging
    console.log(
      `   - Found input for: "${name ? name.replace(/\n/g, " ") : "N/A"}"`
    );
  });

  // --- HELPER: Find Input by Name (Fuzzy Match) ---
  const findInputByName = (paramName) => {
    return allInputs.find((input) => {
      const row = input.closest("tr");
      if (!row) return false;

      const nameEl = row.querySelector(".parameter__name");
      if (!nameEl) return false;

      // Get text, trim whitespace, and ignore "required" asterisks
      const labelText = nameEl.innerText.trim();

      // Strict check first: "function_name" exact match (first line)
      const firstLine = labelText.split("\n")[0].trim();
      if (firstLine === paramName) return true;

      // Fuzzy check: "function_name * required" contains "function_name"
      if (labelText.includes(paramName)) return true;

      return false;
    });
  };

  // --- 1. HANDLE PATH PARAMETERS ---
  const swaggerPath = opblock
    .querySelector(".opblock-summary-path")
    ?.getAttribute("data-path");

  if (swaggerPath && savedApi.url) {
    const defParts = swaggerPath.split("/").filter(Boolean);
    const rawUrlPath = savedApi.url
      .split("?")[0]
      .replace(/^https?:\/\/[^\/]+/, "");
    const savedParts = rawUrlPath.split("/").filter(Boolean);

    defParts.forEach((part, index) => {
      if (part.startsWith("{") && part.endsWith("}")) {
        const paramName = part.slice(1, -1);
        let paramValue = null;

        // Strategy A: Anchor
        if (index > 0) {
          const anchor = defParts[index - 1];
          const anchorIndex = savedParts.lastIndexOf(anchor);
          if (anchorIndex !== -1 && savedParts[anchorIndex + 1]) {
            paramValue = savedParts[anchorIndex + 1];
          }
        }

        // Strategy B: Index
        if (!paramValue && savedParts[index]) {
          paramValue = savedParts[index];
        }

        // Strategy C: Direct Value
        if (
          !paramValue &&
          savedParts.length === 1 &&
          index >= savedParts.length
        ) {
          if (!defParts.includes(savedParts[0])) {
            paramValue = savedParts[0];
          }
        }

        if (paramValue) {
          console.log(
            `🎯 Calculation MATCH: [${paramName}] -> "${paramValue}"`
          );

          const targetInput = findInputByName(paramName);

          if (targetInput) {
            console.log(`✅ DOM Element FOUND for [${paramName}]. Filling...`);
            setNativeValue(targetInput, paramValue);
          } else {
            console.warn(`❌ DOM Element NOT FOUND for param: [${paramName}]`);
            // Fallback: If there is only ONE input in the path section, fill it
            const pathInputs = allInputs.filter(
              (i) => i.closest(".parameters") && !i.closest(".body-param__text")
            );
            if (pathInputs.length === 1 && !savedApi.params) {
              console.log(
                "⚠️ Fallback: Filling the ONLY available path input."
              );
              setNativeValue(pathInputs[0], paramValue);
            }
          }
        }
      }
    });
  }

  // --- 2. HANDLE PARAMS / BODY ---
  let paramsObj = {};
  try {
    paramsObj = JSON.parse(savedApi.params || "{}");
  } catch (e) {}

  const bodyParamTextarea = opblock.querySelector(".body-param__text textarea");

  if (bodyParamTextarea) {
    console.log("📦 Body Field found. Dumping Payload.");
    let dumpData = savedApi.payload
      ? savedApi.payload
      : JSON.stringify(paramsObj, null, 2);
    try {
      dumpData = JSON.stringify(JSON.parse(dumpData), null, 2);
    } catch (e) {}
    setNativeValue(bodyParamTextarea, dumpData);
  } else {
    // Fill inputs
    Object.keys(paramsObj).forEach((key) => {
      const targetInput = findInputByName(key);
      if (targetInput) {
        setNativeValue(
          targetInput,
          typeof paramsObj[key] === "object"
            ? JSON.stringify(paramsObj[key])
            : paramsObj[key]
        );
      }
    });

    // Dynamic Param
    const dynamicInput = allInputs.find((input) => {
      const row = input.closest("tr");
      const name = row?.querySelector(".parameter__name")?.innerText || "";
      return name.includes("dynamic");
    });

    if (dynamicInput) {
      console.log("⚡ Filling 'dynamic' parameter...");
      setNativeValue(dynamicInput, JSON.stringify(paramsObj));
    }
  }
}
/* ===================== PER-MODULE API SAVER ===================== */
function initPremiumApiSaver() {
  const sections = document.querySelectorAll(".opblock-tag-section");

  sections.forEach((section) => {
    const title = section.querySelector(".opblock-tag").innerText.trim();
    const storageKey = "savedApis_" + title.replace(/\s+/g, "_");
    const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");

    if (section.querySelector(".premium-api-saver")) return;

    const box = document.createElement("div");
    box.className = "premium-api-saver";

    box.innerHTML = `
      <div class="api-header">
        <h3>${title} – Saved APIs</h3>
        <button class="toggle-form-btn icon-btn">${IC.plus}</button>
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

        <button class="save-api-btn icon-btn-green">${IC.save} Save</button>
        <hr class="divider" />
      </div>

      <div class="api-list"></div>
    `;

    section.appendChild(box);

    const form = box.querySelector(".api-form");
    const toggleBtn = box.querySelector(".toggle-form-btn");
    const listEl = box.querySelector(".api-list");

    toggleBtn.onclick = () => {
      form.classList.toggle("hide");
      toggleBtn.innerHTML = form.classList.contains("hide") ? IC.plus : IC.down;
      if (form.classList.contains("hide")) editingIndex = null;
    };

    box.querySelector(".save-api-btn").onclick = () => {
      const name = form.querySelector(".api-name").value.trim();
      const url = form.querySelector(".api-url").value.trim();
      const params = form.querySelector(".api-params").value.trim();
      const body = form.querySelector(".api-body").value.trim();

      if (!name || !url) return alert("API Name and URL required");

      const newEntry = { name, url, params, payload: body };

      if (editingIndex !== null) {
        saved[editingIndex] = newEntry;
        editingIndex = null;
      } else {
        saved.push(newEntry);
      }

      localStorage.setItem(storageKey, JSON.stringify(saved));
      renderList();
      form.reset();
      form.classList.add("hide");
      toggleBtn.innerHTML = IC.plus;
    };

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

            <div class="api-actions-horizontal">
              <button class="edit-btn icon-btn-small" data-i="${i}" title="Edit">${IC.edit}</button>
              <button class="fill-btn icon-btn-small" data-i="${i}" title="Fill to Swagger">${IC.fill}</button>
              <button class="delete-btn icon-btn-small" data-i="${i}" title="Delete">${IC.delete}</button>
              <button class="expand-btn icon-btn-small" data-i="${i}" title="Expand">${IC.expand}</button>
            </div>
          </div>

          <div class="api-details">
            <div class="row-line">
              <p><strong>Function Name:</strong></p>
              <button class="copy-btn icon-btn-small" data-type="url" data-i="${i}" title="Copy URL">${IC.copy}</button>
            </div>
            <pre class="json">${api.url}</pre>

            <div class="row-line">
              <p><strong>Params:</strong></p>
              <button class="copy-btn icon-btn-small" data-type="params" data-i="${i}" title="Copy Params">${IC.copy}</button>
            </div>
            <pre class="json">${api.params}</pre>

            <div class="row-line">
              <p><strong>Payload:</strong></p>
              <button class="copy-btn icon-btn-small" data-type="payload" data-i="${i}" title="Copy Payload">${IC.copy}</button>
            </div>
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

          editingIndex = i;
          form.querySelector(".api-name").value = api.name;
          form.querySelector(".api-url").value = api.url;
          form.querySelector(".api-params").value = api.params;
          form.querySelector(".api-body").value = api.payload;

          form.classList.remove("hide");
          toggleBtn.innerHTML = IC.down;
        };
      });

      // FILL TO SWAGGER
      listEl.querySelectorAll(".fill-btn").forEach((btn) => {
        btn.onclick = () => {
          const i = btn.dataset.i;
          const api = saved[i];
          openFillModal(api);
        };
      });

      // DELETE (with confirm)
      listEl.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.onclick = () => {
          const i = btn.dataset.i;

          showConfirmDialog({
            title: "Delete API?",
            message:
              "Are you sure you want to delete this saved API? This action cannot be undone.",
            onConfirm: () => {
              saved.splice(i, 1);
              localStorage.setItem(storageKey, JSON.stringify(saved));
              renderList();
            },
          });
        };
      });

      // EXPAND (smooth, only one open)
      listEl.querySelectorAll(".expand-btn").forEach((btn) => {
        btn.onclick = () => {
          const card = btn.closest(".api-card");
          const details = card.querySelector(".api-details");
          const isOpen = details.classList.contains("open");

          // close all
          document
            .querySelectorAll(".api-details.open")
            .forEach((d) => d.classList.remove("open"));
          document
            .querySelectorAll(".expand-btn")
            .forEach((b) => (b.innerHTML = IC.expand));

          if (!isOpen) {
            details.classList.add("open");
            btn.innerHTML = IC.down;
          }
        };
      });

      // COPY WITH FEEDBACK
      listEl.querySelectorAll(".copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = btn.dataset.i;
          const type = btn.dataset.type;
          let value = saved[i][type] || "";

          const originalHTML = btn.innerHTML;

          try {
            await navigator.clipboard.writeText(value);
          } catch (err) {
            const temp = document.createElement("textarea");
            temp.value = value;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand("copy");
            document.body.removeChild(temp);
          }

          btn.innerHTML =
            '<span style="color:green;font-weight:600;font-size:12px;">✔ Copied</span>';
          btn.style.background = "#d4ffd4";

          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.background = "";
          }, 900);
        });
      });
    }

    renderList();
  });

  injectStyles();
}

/* ---------------------------------------------------------
   GLOBAL CONTROLS (Search + Backup + Restore)
----------------------------------------------------------*/
function initGlobalControls() {
  const servers = document.querySelector(".servers");
  const insertAfter = servers || document.querySelector(".swagger-ui");

  const bar = document.createElement("div");
  bar.className = "global-controls";

  bar.innerHTML = `
    <div class="gc-inner">
      <input id="global-search" class="global-search" placeholder="Search saved APIs..." />

      <button id="backup-btn" class="gc-btn">${IC.download} Backup</button>
      <button id="restore-btn" class="gc-btn">${IC.upload} Restore</button>
      <input id="restore-file" type="file" accept="application/json" style="display:none;" />
    </div>
  `;

  insertAfter.insertAdjacentElement("afterend", bar);

  document.getElementById("global-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll(".api-card").forEach((card) => {
      const title = card.querySelector(".api-title").innerText.toLowerCase();
      card.style.display = title.includes(q) ? "block" : "none";
    });
  });

  document.getElementById("backup-btn").onclick = () => {
    let all = {};
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith("savedApis_"))
        all[k] = JSON.parse(localStorage.getItem(k));
    });

    const blob = new Blob([JSON.stringify(all, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "swagger_saved_apis_backup.json";
    a.click();
  };

  document.getElementById("restore-btn").onclick = () => {
    document.getElementById("restore-file").click();
  };

  document.getElementById("restore-file").onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = JSON.parse(ev.target.result);
      Object.keys(data).forEach((k) =>
        localStorage.setItem(k, JSON.stringify(data[k]))
      );
      location.reload();
    };
    reader.readAsText(e.target.files[0]);
  };

  injectGlobalStyles();
}

/* ---------------------------------------------------------
   GLOBAL + MODULE STYLES
----------------------------------------------------------*/
function injectStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    .premium-api-saver {
      margin:20px 0; 
      background:#fff; 
      border:1px solid #e3e3e3; 
      padding:20px; 
      border-radius:12px;
      box-shadow:0 3px 6px rgba(0,0,0,0.06);
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
      padding:6px 12px; 
      border-radius:6px; 
      transition:0.2s; 
      display:flex; 
      align-items:center; 
      gap:6px;
    }

    .icon-btn-small {
      padding:4px 8px;
    }

    .icon-btn-green {
      background:#d5f4d5;
      margin-top:10px;
    }

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

    .divider {
      margin-top:15px; 
      margin-bottom:10px; 
      border-top:1px solid #ddd;
    }

    .api-card {
      border:1px solid #ddd; 
      padding:15px; 
      border-radius:10px; 
      margin-bottom:14px; 
      background:#fafafa;
    }

    .api-card-header {
      display:flex !important;
      flex-direction:row !important;
      justify-content:space-between;
      align-items:center;
    }

    .api-actions-horizontal {
      display:flex !important;
      flex-direction:row !important;
      gap:12px;
      align-items:center;
      justify-content:flex-end;
    }

    .row-line {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-top:6px;
    }

    .json {
      background:#1e1e1e;
      color:#fff;
      padding:10px;
      border-radius:6px;
      white-space:pre-wrap;
      font-size:13px;
    }

    .api-form.hide {
      display:none;
    }

    /* smooth expand/collapse for api details */
    .api-details {
      overflow:hidden;
      max-height:0;
      opacity:0;
      transition:max-height 0.35s ease, opacity 0.25s ease;
    }

    .api-details.open {
      max-height:800px;
      opacity:1;
    }

    .copy-btn.copied { background:#d1ffd1 !important; }
  `;
  document.body.appendChild(style);
}

/* ===================== CONFIRM DIALOG STYLE ===================== */
const confirmStyle = document.createElement("style");
confirmStyle.innerHTML = `
  #custom-confirm-dialog {
    position: fixed;
    inset: 0;
    width:100%; height:100%;
    display:flex;
    align-items:center;
    justify-content:center;
    z-index:999999;
    animation: fadeIn 0.2s ease-out;
  }

  .confirm-overlay {
    position:absolute;
    inset:0;
    background:rgba(0,0,0,0.45);
    backdrop-filter:blur(3px);
  }

  .confirm-box {
    position:relative;
    background:#fff;
    padding:26px;
    width:350px;
    border-radius:14px;
    box-shadow:0 8px 24px rgba(0,0,0,0.15);
    z-index:1000;
    animation: scaleIn 0.25s ease-out;
  }

  .confirm-title {
    margin:0 0 10px 0;
    font-size:18px;
    font-weight:700;
    color:#222;
  }

  .confirm-msg {
    margin:0 0 22px 0;
    font-size:14px;
    color:#555;
    line-height:1.45;
  }

  .confirm-actions {
    display:flex;
    justify-content:flex-end;
    gap:12px;
  }

  .confirm-btn {
    padding:8px 16px;
    border-radius:8px;
    cursor:pointer;
    font-size:14px;
    border:none;
    transition:0.2s;
  }

  .cancel-btn {
    background:#eee;
  }
  .cancel-btn:hover {
    background:#e0e0e0;
  }

  .delete-btn {
    background:#ff4d4d;
    color:white;
    font-weight:600;
  }
  .delete-btn:hover {
    background:#e04444;
  }

  @keyframes fadeIn {
    from { opacity:0; }
    to { opacity:1; }
  }

  @keyframes scaleIn {
    from { transform:scale(0.85); opacity:0; }
    to   { transform:scale(1); opacity:1; }
  }
`;
document.body.appendChild(confirmStyle);

/* ------------------ GLOBAL CONTROL + FILL MODAL STYLES ------------------ */
function injectGlobalStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    .global-controls {
      margin-top:20px;
      background:#fff;
      border:1px solid #dcdcdc;
      padding:18px;
      border-radius:12px;
      box-shadow:0 3px 6px rgba(0,0,0,0.06);
    }

    .gc-inner {
      display:flex;
      align-items:center;
      gap:14px;
    }

    .global-search {
      flex:1;
      padding:10px 14px;
      border:1px solid #c9c9c9;
      border-radius:10px;
      font-size:14px;
      background:#fafafa;
      transition:0.2s;
    }

    .global-search:focus {
      border-color:#2684ff;
      background:#fff;
      outline:none;
      box-shadow:0 0 0 3px rgba(38,132,255,0.2);
    }

    .gc-btn {
      padding:8px 14px;
      border-radius:8px;
      cursor:pointer;
      display:flex;
      align-items:center;
      gap:6px;
      background:#f4f4f4;
      border:1px solid #ccc;
      transition:0.2s;
      font-size:14px;
    }

    .gc-btn:hover { background:#e8e8e8; }

    .icon-btn-small svg path,
    .icon-btn svg path {
      stroke: #444 !important;
    }

    .delete-btn svg path {
      stroke: #444 !important;
    }

    .delete-btn:hover svg path {
      stroke: white !important;
    }

    /* Fill-to-Swagger modal */
    #fill-to-swagger-modal {
      position:fixed;
      inset:0;
      display:flex;
      align-items:center;
      justify-content:center;
      z-index:999998;
    }

    .fill-overlay {
      position:absolute;
      inset:0;
      background:rgba(0,0,0,0.4);
      backdrop-filter:blur(3px);
    }

    .fill-box {
      position:relative;
      z-index:1000;
      background:#fff;
      padding:20px 22px;
      width:520px;
      max-width:90%;
      border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,0.18);
      max-height:80vh;
      display:flex;
      flex-direction:column;
    }

    .fill-header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:8px;
    }

    .fill-header h3 {
      margin:0;
      font-size:18px;
      font-weight:700;
    }

    .fill-close-btn {
      border:none;
      background:transparent;
      cursor:pointer;
      font-size:18px;
      padding:4px 6px;
    }

    .fill-subtitle {
      margin:0 0 10px 0;
      font-size:13px;
      color:#666;
    }

    .fill-endpoint-list {
      list-style:none;
      padding:0;
      margin:0;
      overflow:auto;
      max-height:60vh;
    }

    .fill-endpoint-item {
      padding:10px 8px;
      border-radius:8px;
      border:1px solid #ececec;
      margin-bottom:8px;
      cursor:pointer;
      transition:0.2s;
    }

    .fill-endpoint-item:hover {
      background:#f7faff;
      border-color:#c2d8ff;
    }

    .fe-line {
      display:flex;
      align-items:center;
      gap:10px;
      margin-bottom:4px;
    }

    .fe-method {
      font-size:11px;
      font-weight:700;
      padding:2px 6px;
      border-radius:4px;
      color:#fff;
      text-transform:uppercase;
    }

    .fe-method-get { background:#61affe; }
    .fe-method-post { background:#49cc90; }
    .fe-method-put { background:#fca130; }
    .fe-method-delete { background:#f93e3e; }

    .fe-path {
      font-family: monospace;
      font-size:13px;
    }

    .fe-desc {
      font-size:12px;
      color:#555;
      margin-left:2px;
    }
  `;
  document.body.appendChild(style);
}
