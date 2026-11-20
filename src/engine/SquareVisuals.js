export const SQUARE_SCENE_ID = 'scene.chapter1.village_square';
const CLOUD_SPEED = 0.85;
const SKY_TOP = -35;

export class SquareVisuals {
  constructor(document) {
    this.document = document;
  }

  drawSky(ctx, assets, timeMs, paused) {
    const mask = assets.getSceneImage(SQUARE_SCENE_ID, 'squareSkylineMask');
    const strip = assets.getSceneImage(SQUARE_SCENE_ID, 'squareClouds');
    if (!this.document || !assets.isLoaded(mask) || !assets.isLoaded(strip)) return false;
    if (this.strip !== strip || this.mask !== mask) {
      this.strip = strip;
      this.mask = mask;
      this.sky = this.document.createElement('canvas');
      this.sky.width = mask.naturalWidth;
      this.sky.height = mask.naturalHeight;
      this.skyContext = this.sky.getContext('2d');
      this.clouds = this.skyContext.createPattern(strip, 'repeat-x');
      this.skyPaintedDistance = NaN;
    }
    const dt = Math.min(100, Math.max(0, timeMs - (this.lastTime ?? timeMs)));
    if (!paused && !this.wasPaused) this.distance = ((this.distance || 0) + CLOUD_SPEED * dt / 1000) % strip.naturalWidth;
    this.lastTime = timeMs;
    this.wasPaused = paused;

    const { sky, skyContext: scratch, clouds } = this;
    if (!clouds) return false;
    const distance = this.distance || 0;
    // At this speed 0.1 px is less than one tenth of a second of motion.
    if (!(Math.abs(distance - this.skyPaintedDistance) < 0.1)) {
      this.skyPaintedDistance = distance;
      scratch.globalCompositeOperation = 'source-over';
      scratch.clearRect(0, 0, sky.width, sky.height);
      scratch.save();
      scratch.translate(distance - 72, SKY_TOP);
      scratch.fillStyle = clouds;
      scratch.fillRect(-strip.naturalWidth, 0, sky.width + 2 * strip.naturalWidth, strip.naturalHeight);
      scratch.restore();
      scratch.globalCompositeOperation = 'destination-in';
      scratch.drawImage(mask, 0, 0);
    }
    ctx.drawImage(sky, 0, 0);
    return true;
  }

  resetSkyClock() {
    this.lastTime = undefined;
  }
}

export function drawChalkFlourish(ctx, rect) {
  ctx.save();
  ctx.translate(rect.x, rect.y);
  ctx.scale(rect.w / 64, rect.h / 124);
  ctx.strokeStyle = '#dfcfb1';
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.64;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(13.5, 112);
  ctx.bezierCurveTo(29, 97.5, 41, 114, 51.5, 103.5);
  ctx.stroke();
  ctx.fillStyle = '#e0d2b9';
  for (let i = 1; i < 58; i++) {
    const t = i / 58, u = 1 - t;
    const x = u ** 3 * 13.5 + 3 * u ** 2 * t * 29 + 3 * u * t ** 2 * 41 + t ** 3 * 51.5;
    const y = u ** 3 * 112 + 3 * u ** 2 * t * 97.5 + 3 * u * t ** 2 * 114 + t ** 3 * 103.5;
    ctx.globalAlpha = 0.14 + 0.18 * Math.sin(i * 23) ** 2;
    ctx.fillRect(x, y + 1.8 * Math.sin(i * 19), 0.9, 0.65);
  }
  ctx.restore();
}
