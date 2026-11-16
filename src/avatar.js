/**
 * Turns an uploaded picture into a small square data URL that is safe to keep in localStorage.
 * (A blob: URL from URL.createObjectURL would stop working after a refresh, so it can't be saved.)
 */
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const AVATAR_ACCEPT = AVATAR_TYPES.join(',');
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export async function fileToAvatar(file, size = 256) {
  if (!file) throw new Error('No file selected.');
  if (!AVATAR_TYPES.includes(file.type)) throw new Error('Please choose a PNG, JPEG or WebP image.');
  if (file.size > AVATAR_MAX_BYTES) throw new Error('That image is larger than 5 MB. Please choose a smaller one.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('That file could not be read as an image.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error('That file could not be read as an image.');
    const sx = (img.naturalWidth - side) / 2; const sy = (img.naturalHeight - side) / 2; // centre-crop to a square
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); // transparent PNGs get a white background
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { URL.revokeObjectURL(url); }
}
