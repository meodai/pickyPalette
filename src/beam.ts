import {
  SourceSession,
  TargetSession,
  extractColorTokens,
  createCollection,
} from "token-beam";

export interface BeamManager {
  sendPalette(): void;
  destroy(): void;
}

interface BeamElements {
  $beamMode: HTMLSelectElement;
  $beamToken: HTMLInputElement;
  $beamConnect: HTMLButtonElement;
  $beamCopy: HTMLButtonElement;
  $beamStatus: HTMLElement;
  $ioLed: HTMLElement;
}

interface BeamCallbacks {
  getDisplayPalette: () => string[];
  setPalette: (colors: string[]) => void;
  closeIO: () => void;
}

export function createBeamManager(
  els: BeamElements,
  cbs: BeamCallbacks,
): BeamManager {
  const {
    $beamMode,
    $beamToken,
    $beamConnect,
    $beamCopy,
    $beamStatus,
    $ioLed,
  } = els;

  let beamSession: SourceSession | TargetSession | null = null;
  let beamSessionToken: string | null = null;

  function showError(msg: string): void {
    $beamStatus.textContent = msg;
    $beamStatus.dataset.state = "error";
  }
  function showInfo(msg: string): void {
    $beamStatus.textContent = msg;
    $beamStatus.dataset.state = "info";
  }
  function clearStatus(): void {
    delete $beamStatus.dataset.state;
    $beamStatus.textContent = "";
  }

  function sendPalette(): void {
    if (!beamSession || $beamMode.value !== "send") return;
    if (!(beamSession instanceof SourceSession) || !beamSession.hasPeers())
      return;
    const dp = cbs.getDisplayPalette();
    if (dp.length === 0) return;
    const tokens: Record<string, string> = {};
    dp.forEach((hex, i) => {
      tokens[`color-${i}`] = hex;
    });
    beamSession.sync(createCollection("picker-palette", tokens));
  }

  // ── Send mode ────────────────────────────────────────────────────
  function initSource(): void {
    $ioLed.classList.remove("is-active");
    if (beamSession) {
      beamSession.disconnect();
      beamSession = null;
    }
    beamSessionToken = null;
    clearStatus();

    $beamToken.value = "";
    $beamToken.disabled = true;
    $beamToken.placeholder = "Generating token\u2026";
    $beamConnect.style.display = "none";
    $beamCopy.style.display = "";
    $beamCopy.textContent = "Copy";

    const session = new SourceSession({
      serverUrl: "wss://tokenbeam.dev",
      clientType: "web",
      origin: "Palette Picker",
      icon: { type: "unicode", value: "\uD83C\uDFA8" },
    });
    beamSession = session;

    session.on("paired", ({ sessionToken }) => {
      beamSessionToken = sessionToken ?? null;
      $beamToken.value = sessionToken ?? "";
      $beamToken.placeholder = "";
      showInfo("Copy this token to sync \u2014 waiting for receiver\u2026");
    });

    session.on("peer-connected", () => {
      showInfo("Paired \u2014 sending palette");
      sendPalette();
    });

    session.on("peer-disconnected", () => {
      showInfo("Peer disconnected \u2014 waiting\u2026");
    });

    session.on("error", ({ message }) => showError(message));
    session.on("disconnected", () => clearStatus());

    session.connect().catch((err: unknown) => {
      showError(err instanceof Error ? err.message : "Could not connect");
      $beamToken.placeholder = "Connection failed";
    });
  }

  $beamCopy.addEventListener("click", () => {
    if (!beamSessionToken) return;
    navigator.clipboard.writeText(beamSessionToken).then(() => {
      $beamCopy.textContent = "Copied!";
      setTimeout(() => {
        $beamCopy.textContent = "Copy";
      }, 1500);
    });
  });

  // ── Receive mode ─────────────────────────────────────────────────
  function initTarget(): void {
    $ioLed.classList.remove("is-active");
    if (beamSession) {
      beamSession.disconnect();
      beamSession = null;
    }
    beamSessionToken = null;
    clearStatus();

    $beamToken.value = "";
    $beamToken.disabled = false;
    $beamToken.placeholder = "Paste session token\u2026";
    $beamConnect.style.display = "";
    $beamConnect.textContent = "Connect";
    $beamConnect.disabled = false;
    $beamCopy.style.display = "none";
  }

  function connectTarget(): void {
    const token = $beamToken.value.trim();
    if (!token) {
      showError("Enter a session token");
      return;
    }

    if (beamSession) {
      beamSession.disconnect();
      beamSession = null;
    }
    clearStatus();

    const session = new TargetSession({
      serverUrl: "wss://tokenbeam.dev",
      clientType: "pickypalette",
      sessionToken: token,
    });
    beamSession = session;

    session.on("paired", () => {
      $beamToken.disabled = true;
      $beamConnect.textContent = "Disconnect";
      showInfo("Paired \u2014 receiving");
    });

    session.on("sync", ({ payload }) => {
      const hexColors = [
        ...new Set(extractColorTokens(payload).map((e) => e.hex)),
      ];
      if (hexColors.length >= 1) {
        cbs.setPalette(hexColors);
        $ioLed.classList.add("is-active");
        cbs.closeIO();
      }
    });

    session.on("error", ({ message }) => showError(message));

    session.on("disconnected", () => {
      $beamToken.disabled = false;
      $beamConnect.textContent = "Connect";
      clearStatus();
      $ioLed.classList.remove("is-active");
      beamSession = null;
    });

    $beamConnect.textContent = "Connecting\u2026";
    $beamConnect.disabled = true;
    session
      .connect()
      .then(() => {
        $beamConnect.disabled = false;
      })
      .catch((err: unknown) => {
        showError(err instanceof Error ? err.message : "Could not connect");
        $beamConnect.textContent = "Connect";
        $beamConnect.disabled = false;
        beamSession = null;
      });
  }

  $beamConnect.addEventListener("click", () => {
    if (
      $beamMode.value === "receive" &&
      beamSession &&
      beamSession instanceof TargetSession &&
      beamSession.getState() === "paired"
    ) {
      beamSession.disconnect();
      beamSession = null;
      initTarget();
      return;
    }
    connectTarget();
  });

  $beamMode.addEventListener("change", () => {
    if ($beamMode.value === "send") initSource();
    else initTarget();
  });

  // Auto-start in send mode
  initSource();

  return {
    sendPalette,
    destroy() {
      if (beamSession) beamSession.disconnect();
    },
  };
}
