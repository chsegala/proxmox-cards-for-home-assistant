import { html, render } from "lit";
import "../src/index";
import { fixtures } from "./fixtures";
import type { Layout } from "../src/card/config";
const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#f3f6fa;color:#182637;font:14px system-ui,sans-serif}main{max-width:1220px;margin:auto;padding:36px 24px}h1{font-size:30px;letter-spacing:-1px;margin:12px 0}p{color:#687789;line-height:1.6}.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#397b99}nav{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin:28px 0}select,button{padding:10px 14px;font:inherit;border:1px solid #dce3ea;border-radius:8px;background:var(--card-background-color,#fff);color:inherit}label{display:flex;gap:8px;align-items:center}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px;align-items:start}.caption{font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;color:var(--secondary-text-color,#687789)}body.dark{background:#111b27;color:#e5edf5;--primary-text-color:#e5edf5;--secondary-text-color:#9babbc;--card-background-color:#1b2938;--secondary-background-color:#243446;--divider-color:#344556;--primary-color:#75bdd7;--success-color:#63cba0;--error-color:#ed8585;--warning-color:#e7bd65}body.dark p{color:#9babbc}`;
document.head.append(style);
let layout: Layout = "standard";
let bars = true;
let percentages = true;
function update() {
  render(
    html`<main>
      <div class="eyebrow">Infrastructure cards / development preview</div>
      <h1>Proxmox VM Card</h1>
      <p>
        Normalized fixture data. Six core scenarios, three layouts, no backend
        connection.
      </p>
      <nav>
        <label
          >Layout
          <select
            @change=${(e: Event) => {
              layout = (e.target as HTMLSelectElement).value as Layout;
              update();
            }}
          >
            ${(["compact", "standard", "detailed"] as Layout[]).map((value) => html`<option .selected=${layout === value}>${value}</option>`)}
          </select></label
        ><label
          ><input
            type="checkbox"
            .checked=${bars}
            @change=${(e: Event) => {
              bars = (e.target as HTMLInputElement).checked;
              update();
            }}
          />Progress bars</label
        ><label
          ><input
            type="checkbox"
            .checked=${percentages}
            @change=${(e: Event) => {
              percentages = (e.target as HTMLInputElement).checked;
              update();
            }}
          />Memory / disk percentages</label
        ><button @click=${() => document.body.classList.toggle("dark")}>
          Toggle theme
        </button>
      </nav>
      <div class="grid">
        ${Object.entries(fixtures).map(
          ([name, model]) =>
            html`<section>
              <p class="caption">${name}</p>
              <proxmox-vm-card .model=${model}></proxmox-vm-card>
            </section>`,
        )}
        <section>
          <p class="caption">Loading</p>
          <proxmox-vm-card .loading=${true}></proxmox-vm-card>
        </section>
      </div>
    </main>`,
    document.body,
  );
  document.querySelectorAll("proxmox-vm-card").forEach((card) =>
    (card as import("../src/card/proxmox-vm-card").ProxmoxVmCard).setConfig({
      type: "custom:proxmox-vm-card",
      device: "fixture",
      layout,
      progress_bars: bars,
      memory_percentage: percentages,
      disk_percentage: percentages,
    }),
  );
}
update();
