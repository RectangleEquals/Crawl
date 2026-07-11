/** Area-transition loading plate (Docs/01 §2.3): dithered card, name, hint. */

const HINTS = [
  "The Gloam re-knits the land behind you. No map survives the Crawl.",
  "Chorale-stones hum where the star's hull fell. Sanctums are built on them.",
  "Bank what you cannot bear to lose. The furrow keeps what it takes.",
  "The Meridian Peddler walks between the lights. His rumors are always true.",
  "Instruments answer locks. Greed answers everything else.",
];

export class LoadingPlate {
  private readonly el: HTMLElement;
  private shownAt = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "loading-plate";
    this.el.innerHTML = `
      <div class="plate-inner">
        <div class="plate-kicker">— the way opens —</div>
        <div class="plate-name" id="plate-name"></div>
        <div class="plate-hint" id="plate-hint"></div>
      </div>`;
    this.el.style.display = "none";
    root.appendChild(this.el);
  }

  show(areaName: string): void {
    (this.el.querySelector("#plate-name") as HTMLElement).textContent = areaName;
    (this.el.querySelector("#plate-hint") as HTMLElement).textContent =
      HINTS[Math.floor(Math.random() * HINTS.length)] ?? "";
    this.el.style.display = "flex";
    this.el.style.opacity = "1";
    this.shownAt = performance.now();
  }

  /** Fades out, honoring a minimum on-screen time so plates never strobe. */
  hide(minMs = 700): void {
    const wait = Math.max(0, minMs - (performance.now() - this.shownAt));
    setTimeout(() => {
      this.el.style.opacity = "0";
      setTimeout(() => {
        this.el.style.display = "none";
      }, 260);
    }, wait);
  }
}
