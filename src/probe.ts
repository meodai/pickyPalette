export interface ProbeRenderData {
  hex: string;
  hint: string;
  x: number;
  y: number;
}

export interface ProbeManager {
  setEvent(
    event: PointerEvent,
    render: (event: PointerEvent) => ProbeRenderData | null,
  ): void;
  requestRender(render: (event: PointerEvent) => ProbeRenderData | null): void;
  clear(): void;
  getEvent(): PointerEvent | null;
}

interface ProbeManagerOptions {
  onHide?: () => void;
}

export function createProbeManager(
  options: ProbeManagerOptions = {},
): ProbeManager {
  const { onHide } = options;
  const probe = document.createElement("div");
  probe.className = "cursor-probe";
  probe.innerHTML =
    '<span class="cursor-probe__dot"></span><span class="cursor-probe__label"></span><span class="cursor-probe__hint"></span>';
  const probeDot = probe.querySelector<HTMLElement>(".cursor-probe__dot")!;
  const probeLabel = probe.querySelector<HTMLElement>(".cursor-probe__label")!;
  const probeHint = probe.querySelector<HTMLElement>(".cursor-probe__hint")!;
  document.body.appendChild(probe);

  let probeRAF: number | null = null;
  let probeEvent: PointerEvent | null = null;

  function hide(): void {
    probe.classList.remove("is-visible");
    onHide?.();
  }

  function runRender(
    render: (event: PointerEvent) => ProbeRenderData | null,
  ): void {
    probeRAF = null;
    if (!probeEvent) return;
    const next = render(probeEvent);
    if (!next) {
      hide();
      return;
    }
    probeDot.style.background = next.hex;
    probeLabel.textContent = next.hex;
    probeHint.textContent = next.hint;
    probe.style.left = `${next.x}px`;
    probe.style.top = `${next.y}px`;
    probe.classList.add("is-visible");
  }

  return {
    setEvent(event, render) {
      probeEvent = event;
      if (probeRAF !== null) return;
      probeRAF = requestAnimationFrame(() => runRender(render));
    },
    requestRender(render) {
      if (!probeEvent || probeRAF !== null) return;
      probeRAF = requestAnimationFrame(() => runRender(render));
    },
    clear() {
      probeEvent = null;
      if (probeRAF !== null) {
        cancelAnimationFrame(probeRAF);
        probeRAF = null;
      }
      hide();
    },
    getEvent() {
      return probeEvent;
    },
  };
}
