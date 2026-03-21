import type { Axis } from "./types";
import { AXES } from "./types";
import { AXIS_NAMES, computeSliderStops } from "./color";

export interface Controls {
  $colorModel: HTMLSelectElement;
  $distanceMetric: HTMLSelectElement;
  $outlineCheckbox: HTMLInputElement;
  $gamutClipCheckbox: HTMLInputElement;
  $autoSortCheckbox: HTMLInputElement;
  $markersCheckbox: HTMLInputElement;
  $snapAxisCheckbox: HTMLInputElement;
  $invertZBtn: HTMLButtonElement;
  $sliderInvertBtn: HTMLButtonElement;
  $posSlider: HTMLInputElement;
  $sliderCell: HTMLDivElement;

  readonly axis: Axis;
  setAxis(axis: Axis): void;
  updateLabels(): void;

  onAxisChange: ((axis: Axis) => void) | null;
}

function labeled(text: string, el: HTMLElement): HTMLLabelElement {
  const $label = document.createElement("label");
  const $span = document.createElement("span");
  $span.textContent = text;
  $label.appendChild($span);
  $label.appendChild(el);
  return $label;
}

export function createControls(
  $tools: HTMLElement,
  $sliderWrap: HTMLElement,
): Controls {
  let currentAxis: Axis = "y";

  // ── Color model dropdown ───────────────────────────────────────────
  const $colorModel = document.createElement("select");
  $colorModel.innerHTML = `
    <optgroup label="OK — Hue-based">
      <option value="okhsl" selected>OKHsl</option>
      <option value="okhslPolar">OKHsl Polar</option>
      <option value="okhsvPolar">OKHsv Polar</option>
      <option value="okhsv">OKHsv</option>
    </optgroup>
    <optgroup label="OK — Lab / LCH">
      <option value="oklab">OKLab</option>
      <option value="oklch">OKLch</option>
      <option value="oklchPolar">OKLch Polar</option>
      <option value="oklrab">OKLrab</option>
      <option value="oklrch">OKLrch</option>
      <option value="oklrchPolar">OKLrch Polar</option>
      <option value="oklchDiag">OKLch Complementary</option>
      <option value="oklrchDiag">OKLrch Complementary</option>
    </optgroup>
    <optgroup label="CIE Lab / LCH — D65">
      <option value="cielab">CIELab</option>
      <option value="cielch">CIELch</option>
      <option value="cielchPolar">CIELch Polar</option>
    </optgroup>
    <optgroup label="CIE Lab / LCH — D50">
      <option value="cielabD50">CIELab D50</option>
      <option value="cielchD50">CIELch D50</option>
      <option value="cielchD50Polar">CIELch D50 Polar</option>
    </optgroup>
    <optgroup label="CAM16 — D65">
      <option value="cam16ucsD65">CAM16-UCS D65</option>
      <option value="cam16ucsD65Polar">CAM16-UCS Polar D65</option>
    </optgroup>
    <optgroup label="Classic">
      <option value="hslPolar">HSL Polar</option>
      <option value="hsl">HSL</option>
      <option value="hsvPolar">HSV Polar</option>
      <option value="hsv">HSV</option>
      <option value="hwbPolar">HWB Polar</option>
      <option value="hwb">HWB</option>
      <option value="rgb">RGB</option>
    </optgroup>
    <optgroup label="Spectral">
      <option value="spectrum">Visible Spectrum</option>
    </optgroup>
  `;

  // ── Axis buttons (settings row) ────────────────────────────────────
  const $axisGroup = document.createElement("span");
  $axisGroup.className = "axis-buttons";
  const $axisBtns = AXES.map((a) => {
    const btn = document.createElement("button");
    btn.className = "axis-btn";
    btn.dataset.axis = a;
    if (a === currentAxis) btn.classList.add("is-active");
    btn.addEventListener("click", () => controls.setAxis(a));
    $axisGroup.appendChild(btn);
    return btn;
  });

  // Model row layout
  const $modelRow = document.createElement("label");
  $modelRow.className = "picker__model-row";
  const $modelSpan = document.createElement("span");
  $modelSpan.textContent = "Color model";
  const $modelControls = document.createElement("span");
  $modelControls.className = "picker__model-controls";
  const $invertZBtn = document.createElement("button");
  $invertZBtn.type = "button";
  $invertZBtn.className = "picker__invert-btn";
  $invertZBtn.textContent = "\u25D1";
  $invertZBtn.title = "Invert Slider Axis";

  const $invertGroup = document.createElement("span");
  $invertGroup.className = "picker__invert-group";
  $invertGroup.appendChild($invertZBtn);

  $modelControls.appendChild($colorModel);
  $modelControls.appendChild($axisGroup);

  const $modelRight = document.createElement("span");
  $modelRight.className = "picker__model-right";
  $modelRight.appendChild($modelControls);
  $modelRight.appendChild($invertGroup);

  $modelRow.appendChild($modelSpan);
  $modelRow.appendChild($modelRight);

  // Inner wrapper for grid height animation
  const $inner = document.createElement("div");
  $inner.className = "picker__settings-inner";
  $tools.appendChild($inner);
  let settingsIndex = 0;
  function appendSetting(el: HTMLElement): void {
    el.style.setProperty("--i", String(settingsIndex++));
    $inner.appendChild(el);
  }
  appendSetting($modelRow);

  // ── Distance metric ────────────────────────────────────────────────
  const $distanceMetric = document.createElement("select");
  $distanceMetric.innerHTML = `
    <optgroup label="OK">
      <option value="oklab" selected>OKLab</option>
      <option value="oklrab">OKLrab</option>
    </optgroup>
    <optgroup label="CIE — D65">
      <option value="deltaE76">Euclidean / \u0394E76</option>
      <option value="deltaE94">\u0394E94</option>
      <option value="deltaE2000">\u0394E2000</option>
    </optgroup>
    <optgroup label="CIE — D50">
      <option value="cielabD50">Euclidean D50</option>
    </optgroup>
    <optgroup label="Misc">
      <option value="cam16ucsD65">CAM16-UCS D65</option>
      <option value="rgb">RGB</option>
    </optgroup>
  `;
  appendSetting(labeled("Distance metric", $distanceMetric));

  // ── Toggle checkboxes ──────────────────────────────────────────────
  function checkbox(label: string, checked: boolean): HTMLInputElement {
    const $cb = document.createElement("input");
    $cb.type = "checkbox";
    $cb.checked = checked;
    appendSetting(labeled(label, $cb));
    return $cb;
  }

  const $outlineCheckbox = checkbox("Outline", false);
  const $gamutClipCheckbox = checkbox("Clip to sRGB", false);
  const $autoSortCheckbox = checkbox("Auto-Sort Color Swatches", true);
  const $markersCheckbox = document.createElement("input");
  $markersCheckbox.type = "checkbox";
  $markersCheckbox.checked = false;
  const $markersLabel = document.createElement("label");
  const $markersSpan = document.createElement("span");
  $markersSpan.innerHTML = "Show Color Markers <kbd>P</kbd>";
  $markersLabel.appendChild($markersSpan);
  $markersLabel.appendChild($markersCheckbox);
  appendSetting($markersLabel);

  const $snapAxisCheckbox = checkbox("Ease to Current Slice on Drag", true);

  // ── Position slider ────────────────────────────────────────────────
  const $posSlider = document.createElement("input");
  $posSlider.type = "range";
  $posSlider.min = "0";
  $posSlider.max = "1";
  $posSlider.step = "0.001";
  $posSlider.value = "0.5";

  const $sliderAxisWrap = document.createElement("div");
  $sliderAxisWrap.className = "picker__axis-switcher";
  const $sliderAxisBtns = AXES.map((a) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "picker__axis-btn";
    btn.dataset.axis = a;
    if (a === currentAxis) btn.classList.add("is-active");
    btn.addEventListener("click", () => controls.setAxis(a));
    $sliderAxisWrap.appendChild(btn);
    return btn;
  });

  const $sliderCell = document.createElement("div");
  $sliderCell.className = "picker__slider-cell";
  $sliderCell.appendChild($posSlider);

  const $sliderInvertBtn = document.createElement("button");
  $sliderInvertBtn.type = "button";
  $sliderInvertBtn.className = "picker__slider-invert-btn";
  $sliderInvertBtn.textContent = "\u25D1";
  $sliderInvertBtn.title = "Invert Slider Axis";
  $sliderInvertBtn.addEventListener("click", () => $invertZBtn.click());

  $sliderWrap.appendChild($sliderAxisWrap);
  $sliderWrap.appendChild($sliderCell);
  $sliderWrap.appendChild($sliderInvertBtn);

  // ── Internal update helpers ────────────────────────────────────────
  function updateAxisButtonLabels(): void {
    const names = AXIS_NAMES[$colorModel.value] || ["X", "Y", "Z"];
    $axisBtns.forEach((btn, i) => {
      btn.textContent = names[i];
    });
    $sliderAxisBtns.forEach((btn, i) => {
      btn.textContent = names[i];
      btn.classList.toggle("is-active", AXES[i] === currentAxis);
    });
  }

  function updateSliderGradient(): void {
    const stops = computeSliderStops($colorModel.value, currentAxis);
    if (stops.length === 0) {
      $sliderCell.style.removeProperty("--slider-gradient");
    } else {
      $sliderCell.style.setProperty(
        "--slider-gradient",
        `linear-gradient(to right, ${stops.join(", ")})`,
      );
    }
  }

  function updateLabels(): void {
    updateAxisButtonLabels();
    updateSliderGradient();
  }

  // ── Exposed controls object ────────────────────────────────────────
  const controls: Controls = {
    $colorModel,
    $distanceMetric,
    $outlineCheckbox,
    $gamutClipCheckbox,
    $autoSortCheckbox,
    $markersCheckbox,
    $snapAxisCheckbox,
    $invertZBtn,
    $sliderInvertBtn,
    $posSlider,
    $sliderCell: $sliderCell as HTMLDivElement,

    get axis() {
      return currentAxis;
    },
    setAxis(axis: Axis) {
      currentAxis = axis;
      $axisBtns.forEach((btn) =>
        btn.classList.toggle("is-active", btn.dataset.axis === axis),
      );
      updateLabels();
      controls.onAxisChange?.(axis);
    },
    updateLabels,

    onAxisChange: null,
  };

  // Color model change updates labels internally
  $colorModel.addEventListener("change", () => updateLabels());

  // Initial label render
  updateLabels();

  return controls;
}
