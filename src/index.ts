import { ProxmoxVmCard } from "./card/proxmox-vm-card";
if (!customElements.get("proxmox-vm-card"))
  customElements.define("proxmox-vm-card", ProxmoxVmCard);
