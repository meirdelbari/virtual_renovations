from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from ultralytics import YOLO
import io
import base64
import numpy as np


class ImagePayload(BaseModel):
    imageDataUrl: str


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def load_model():
    # Load a small segmentation model once at startup.
    # This will download weights the first time you run it.
    global model
    model = YOLO("yolov8n-seg.pt")


@app.post("/segment-floor")
def segment_floor(payload: ImagePayload):
    """
    Accepts a base64 data URL, runs YOLO-Seg, and returns a
    binary floor mask as a PNG data URL.

    Heuristic for floor:
    - Among all instance masks, choose the one with
      the largest area whose centroid is in the lower
      half of the image. If none match, fall back to
      the largest mask overall.
    """

    data_url = payload.imageDataUrl
    if "," not in data_url:
        return {"error": "Invalid imageDataUrl format"}

    header, b64 = data_url.split(",", 1)
    try:
        image_bytes = base64.b64decode(b64)
    except Exception:
        return {"error": "Could not decode base64 image data"}

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return {"error": "Could not open image"}

    # Run YOLO-Seg
    results = model(img)
    r = results[0]

    if r.masks is None or r.masks.data is None:
        return {"error": "No segmentation masks found"}

    masks = r.masks.data.cpu().numpy()  # shape: [N, H, W]
    h, w = masks.shape[1], masks.shape[2]

    best_idx = None
    best_area = 0

    for idx, mask in enumerate(masks):
        # mask is [H, W] with 0/1 values
        area = float(mask.sum())
        if area <= 0:
            continue

        ys, xs = np.where(mask > 0.5)
        if ys.size == 0:
            continue

        centroid_y = ys.mean()

        # Prefer large masks in the lower half of the image.
        in_lower_half = centroid_y > h / 2

        score = area
        if in_lower_half:
            score *= 1.5

        if score > best_area:
            best_area = score
            best_idx = idx

    if best_idx is None:
        return {"error": "No suitable floor mask detected"}

    floor_mask = masks[best_idx]  # [H, W]

    # Convert mask to binary PNG (0 or 255)
    mask_img = (floor_mask > 0.5).astype(np.uint8) * 255
    mask_pil = Image.fromarray(mask_img, mode="L")

    buf = io.BytesIO()
    mask_pil.save(buf, format="PNG")
    mask_bytes = buf.getvalue()
    mask_b64 = base64.b64encode(mask_bytes).decode("ascii")
    mask_data_url = f"data:image/png;base64,{mask_b64}"

    return {
        "maskDataUrl": mask_data_url,
        "height": h,
        "width": w,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": "model" in globals()}


