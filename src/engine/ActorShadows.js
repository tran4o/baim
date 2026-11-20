// Directions follow the light and shadow painted into the floor of each scene.
// X and Y are the horizontal and depth offsets per unit of actor height.
const sceneLighting = {
  'scene.chapter1.village_square': { x: 0.42, y: 0.16, opacity: 0.38, blur: 2.4, contact: 0.48 },
  'scene.chapter1.apartment': { x: 0.35, y: 0.19, opacity: 0.28, blur: 4.2, contact: 0.46 },
  'scene.chapter1.mehana': { x: 0.45, y: 0.27, opacity: 0.32, blur: 3.2, contact: 0.49 },
  'scene.chapter1.municipality': { x: 0.23, y: 0.15, opacity: 0.23, blur: 5.0, contact: 0.45 },
  'scene.chapter1.mayor_office': { x: 0.35, y: 0.25, opacity: 0.30, blur: 3.4, contact: 0.47 },
  'scene.chapter1.election_booth': { x: 0.44, y: 0.31, opacity: 0.33, blur: 3.2, contact: 0.48 }
};
const ambientLight = { x: 0.04, y: 0.10, opacity: 0.19, blur: 5.0, contact: 0.45 };

export function shadowLighting(sceneId) {
  return sceneLighting[sceneId] || ambientLight;
}

export class ActorShadows {
  constructor(document) {
    this.document = document;
    this.footprints = new WeakMap();
    this.shadows = new Map();
  }

  draw(ctx, sprite, source, rect, groundY, mirrored, sceneId) {
    if (!this.document) return false;
    const sourceKey = [source.x, source.y, source.w, source.h].join(',');
    const scale = rect.h / 256;
    const width = Math.round(rect.w / scale);
    const ground = Math.round((groundY - rect.y) / scale);
    const key = [sceneId, sprite.src, sourceKey, width, ground, mirrored].join(':');
    let shadow = this.shadows.get(key);
    if (!shadow) {
      shadow = this.createShadow(sprite, source, sourceKey, width, ground, mirrored, shadowLighting(sceneId));
      if (this.shadows.size >= 64) this.shadows.delete(this.shadows.keys().next().value);
    } else {
      this.shadows.delete(key);
    }
    this.shadows.set(key, shadow);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(shadow.canvas, rect.x + shadow.left * scale, rect.y + shadow.top * scale,
      shadow.canvas.width * scale, shadow.canvas.height * scale);
    ctx.restore();
    return true;
  }

  createShadow(sprite, source, sourceKey, actorWidth, ground, mirrored, light) {
    const actorHeight = 256, sampleSize = 80;
    const { lowest, shoeStart } = this.footprint(sprite, source, sourceKey, sampleSize);
    const depthBottom = ground - actorHeight;
    const minX = Math.min(0, depthBottom * light.x, ground * light.x);
    const maxX = Math.max(0, depthBottom * light.x, ground * light.x);
    const castTop = ground + Math.min(depthBottom * light.y, ground * light.y);
    const castBottom = ground + Math.max(depthBottom * light.y, ground * light.y);
    const padding = Math.max(8, Math.ceil(light.blur * 2.5));
    const left = Math.floor(minX) - padding;
    const top = Math.floor(Math.min(castTop, shoeStart * actorHeight / sampleSize)) - padding;
    const width = Math.ceil(actorWidth + maxX - left) + padding + 2;
    const height = Math.ceil(Math.max(actorHeight, castBottom) - top) + padding + 4;
    const buffer = this.cast ||= this.document.createElement('canvas');
    if (buffer.width < width) buffer.width = Math.ceil(width / 64) * 64;
    if (buffer.height < height) buffer.height = Math.ceil(height / 64) * 64;
    const cast = buffer.getContext('2d');
    cast.globalCompositeOperation = 'source-over';
    cast.clearRect(0, 0, buffer.width, buffer.height);
    cast.save();
    cast.translate(ground * light.x - left, ground * (1 + light.y) - top);
    cast.transform(1, 0, -light.x, -light.y, 0, 0);
    if (mirrored) {
      cast.translate(actorWidth, 0);
      cast.scale(-1, 1);
    }
    cast.drawImage(sprite, source.x, source.y, source.w, source.h, 0, 0, actorWidth, actorHeight);
    cast.restore();
    cast.globalCompositeOperation = 'source-in';
    cast.fillStyle = '#473b30';
    cast.fillRect(0, 0, width, height);

    const canvas = this.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const shadow = canvas.getContext('2d');
    shadow.globalAlpha = light.opacity;
    shadow.filter = `blur(${light.blur}px)`;
    shadow.drawImage(buffer, 0, 0);

    // The contact strip follows the actual shoe pixels, including mirrored poses.
    const step = actorWidth / sampleSize;
    shadow.globalAlpha = light.contact;
    shadow.fillStyle = '#302718';
    shadow.filter = 'blur(1.35px)';
    shadow.beginPath();
    for (let x = 0; x < sampleSize; x++) {
      if (lowest[x] < 0 || lowest[x] < shoeStart) continue;
      const screenX = (mirrored ? sampleSize - 1 - x : x) * step - left;
      const screenY = (lowest[x] + 0.7) * actorHeight / sampleSize - top;
      shadow.rect(screenX - 0.3, screenY - 0.8, step + 0.6, 2.2);
    }
    shadow.fill();
    return { canvas, left, top };
  }

  footprint(sprite, source, key, size) {
    let frames = this.footprints.get(sprite);
    if (!frames) this.footprints.set(sprite, frames = new Map());
    if (!frames.has(key)) {
      if (!this.footSampler) {
        const canvas = this.document.createElement('canvas');
        canvas.width = canvas.height = size;
        this.footSampler = canvas.getContext('2d', { willReadFrequently: true });
      }
      const sample = this.footSampler;
      sample.clearRect(0, 0, size, size);
      sample.drawImage(sprite, source.x, source.y, source.w, source.h, 0, 0, size, size);
      const pixels = sample.getImageData(0, 0, size, size).data;
      const lowest = new Int8Array(size).fill(-1);
      let top = size, bottom = -1;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (pixels[(y * size + x) * 4 + 3] < 150) continue;
          top = Math.min(top, y);
          bottom = y;
          lowest[x] = y;
        }
      }
      frames.set(key, { lowest, shoeStart: bottom - (bottom - top) * 0.18 });
    }
    return frames.get(key);
  }
}
