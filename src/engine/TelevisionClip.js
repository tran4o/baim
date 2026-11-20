// The local preview server serves whole files. A single buffered clip lets the
// player seek and loop without requiring byte-range support.
export class TelevisionClip {
  constructor(document) {
    this.document = document;
    this.video = null;
    this.source = null;
    this.powered = false;
    this.loading = false;
    this.startPending = false;
    this.playBlocked = false;
  }

  sync(source, powered, paused) {
    if (!powered) {
      if (this.video && this.powered) {
        this.video.pause();
        if (this.video.readyState >= 1) this.video.currentTime = 0;
      }
      this.powered = false;
      this.playBlocked = false;
      return;
    }
    this.powered = true;
    if (!this.document || !source) return;
    if (source !== this.source) this.load(source);
    const video = this.video;
    if (paused) {
      video.pause();
      this.playBlocked = false;
    } else if (!this.loading && video.src && video.paused && !video.error && !this.startPending && !this.playBlocked) {
      this.startPending = true;
      video.play().catch(error => {
        if (error.name !== 'AbortError') this.playBlocked = true;
      }).finally(() => { this.startPending = false; });
    }
  }

  load(source) {
    if (this.video?.src.startsWith('blob:')) URL.revokeObjectURL(this.video.src);
    this.video?.pause();
    this.source = source;
    const video = this.document.createElement('video');
    this.video = video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    this.loading = true;
    fetch(source).then(response => {
      if (!response.ok) throw new Error('TV clip unavailable');
      return response.blob();
    }).then(blob => {
      if (this.video === video) video.src = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
    }).catch(() => {
      // Keep the existing fictional news graphic when the optional clip is unavailable.
    }).finally(() => {
      if (this.video === video) this.loading = false;
    });
  }

  draw(ctx, screen, reflection) {
    if (!this.video || this.video.readyState < 2 || this.video.error) return false;
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.scale(screen.w / 45, screen.h / 59);
    ctx.translate(-53, -268);
    ctx.beginPath();
    ctx.moveTo(51, 287);
    ctx.bezierCurveTo(51, 273, 57, 269, 68, 267);
    ctx.lineTo(90, 265.5);
    ctx.bezierCurveTo(99, 265, 102, 270, 103, 282);
    ctx.bezierCurveTo(105, 296, 104, 310, 100, 318);
    ctx.bezierCurveTo(97, 326, 79, 327, 63, 327);
    ctx.bezierCurveTo(53, 327, 51, 322, 51, 312);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(this.video, 45, 264, 65, 65);
    if (reflection?.complete && reflection.naturalWidth) {
      const sx = reflection.naturalWidth / ctx.canvas.width;
      const sy = reflection.naturalHeight / ctx.canvas.height;
      ctx.globalAlpha = 0.32;
      ctx.drawImage(reflection, screen.x * sx - 3 * sx, screen.y * sy - 4 * sy,
        55 * sx, 65 * sy, 50, 264, 55, 65);
      ctx.globalAlpha = 1;
    }
    const edge = ctx.createRadialGradient(77, 294, 11, 77, 294, 35);
    edge.addColorStop(0, 'transparent');
    edge.addColorStop(1, 'rgba(12,19,20,0.42)');
    ctx.fillStyle = edge;
    ctx.fillRect(50, 264, 55, 65);
    ctx.restore();
    return true;
  }
}
