function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) {
          h = (maxWidth / w) * h;
          w = maxWidth;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function initCamera(onImageSelected) {
  const input = document.getElementById('form-image');
  const preview = document.getElementById('image-preview');

  document.getElementById('btn-camera').addEventListener('click', () => {
    input.removeAttribute('capture');
    input.setAttribute('capture', 'environment');
    input.click();
  });

  document.getElementById('btn-gallery').addEventListener('click', () => {
    input.removeAttribute('capture');
    input.click();
  });

  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const base64 = await compressImage(file);
    preview.src = base64;
    preview.classList.remove('hidden');
    onImageSelected(base64);
  });
}

function clearImage() {
  const preview = document.getElementById('image-preview');
  const input = document.getElementById('form-image');
  preview.src = '';
  preview.classList.add('hidden');
  input.value = '';
}
