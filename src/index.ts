import { ProxmoxVmCard } from "./card/proxmox-vm-card";
if (!customElements.get("proxmox-vm-card"))
  customElements.define("proxmox-vm-card", ProxmoxVmCard);

import { ProxmoxVmCardEditor } from "./card/proxmox-vm-card-editor";
if (!customElements.get("proxmox-vm-card-editor"))
  customElements.define("proxmox-vm-card-editor", ProxmoxVmCardEditor);
const host = window as Window & {
  customCards?: { type: string; name: string; description: string }[];
};
host.customCards ??= [];
if (!host.customCards.some((card) => card.type === "proxmox-vm-card"))
  host.customCards.push({
    type: "proxmox-vm-card",
    name: "Proxmox VM Card",
    description:
      "Monitor and control a VM from the official Proxmox VE integration.",
  });
