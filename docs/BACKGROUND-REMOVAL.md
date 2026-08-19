# Background removal — the options, priced honestly

What ships today: `@imgly/background-removal` running **in the seller's
browser**. $0 per image forever, photos never leave their machine, and the
compute scales with users because each seller's laptop does its own work.
Keep this as the default; everything below is for when it isn't enough
(phones too weak, batch jobs, or server-side processing at fill time).

## The models (all runnable yourself)

| Model | Quality | Licence | Notes |
|---|---|---|---|
| **U²-Net** | good | Apache-2.0 | the classic; what most "remove bg" tools wrap |
| **ISNet (general-use)** | better | Apache-2.0 | crisper edges than U²-Net, similar speed |
| **BiRefNet** | best open | MIT | current best open-weights edges; heavy — slow on CPU |
| BRIA RMBG-1.4/2.0 | excellent | **NON-commercial** | ⚠️ needs a paid licence from BRIA for a commercial product. Flock is commercial. Do not ship this one. |

The licensing line matters: RMBG is all over tutorials because the quality is
great, and shipping it in a paid product without a BRIA licence is a legal
problem, not a style one. ISNet or BiRefNet get 95% of the way with clean
licences.

## Running your own API — yes, it's ~20 lines

[rembg](https://github.com/danielgatis/rembg) wraps all three good models and
ships a ready HTTP server:

```bash
# On any VPS with Docker (a ~$5/mo box handles thousands of images/day):
docker run -d -p 7000:7000 danielgatis/rembg s --host 0.0.0.0 --port 7000
```

That's the whole API. Then:

```bash
curl -s -F "file=@photo.jpg" "http://your-box:7000/api/remove?model=isnet-general-use" -o cutout.png
```

Composite onto white with sharp on our side (we already depend on sharp):

```ts
const white = await sharp({ create: { width: w, height: h, channels: 3, background: "#fff" } })
  .composite([{ input: cutoutPng }])
  .jpeg({ quality: 92 })
  .toBuffer();
```

**Where to put it, cheapest first:**

| Host | Cost | Trade |
|---|---|---|
| Hetzner/Racknerd VPS, CPU | ~$4–6/mo flat | 1–3s per image with ISNet; you run it |
| Modal / Replicate (serverless GPU) | roughly $0.001–0.01 per image (verify current pricing) | zero ops, cold starts |
| PhotoRoom / remove.bg API | ~$0.02–0.20 per image (verify) | best quality, the metered thing competitors resell |

Vercel is NOT an option for this — the model is too big for serverless
functions and there's no GPU. The API has to live somewhere else.

## Why the browser version stays the default

- **The cost curve is the product argument.** Server-side, every photo costs
  Flock money, which is how competitors end up metering background removals
  (Vendoo: 0/300/1,500 by tier). In-browser, cost per image is zero at any
  scale, so the feature stays unmetered on every plan — including free.
- Privacy is real: the photo never leaves the seller's machine.
- The trade is the ~50MB first-use download and a few seconds per photo.

Add the server path when a real limit appears (mobile sellers, bulk
re-processing of imported listings), and when it does: ISNet on a $5 VPS
first, GPU serverless only if latency actually hurts.

---

## Removing a hand, a shadow, or a stray object

Different problem, different tool. Background removal is **segmentation**:
find the subject, drop everything else. Removing a hand *holding* the garment
is **inpainting**: the hand overlaps the subject, so cutting it out leaves a
hole that has to be invented plausibly.

**Worth knowing before reaching for a tool:** if the hand is in the
*background* (holding the tag, resting on the bed beside the shoe),
segmentation already removes it — the white-background toggle handles that
case for free. Only a hand *on top of* the garment needs inpainting.

### Services, best-value first

| Tool | Cost | Notes |
|---|---|---|
| **Photoshop Generative Fill / Firefly** | included in a Photoshop sub | best results by a distance for hands and shadows; commercial-safe. Brush the hand, generate, done. |
| **Photopea** (free, browser) | free | Photoshop-like clone-stamp/heal. Manual but genuinely free, no account. |
| **Cleanup.pictures** | free tier, ~$5/mo HD | purpose-built object removal, brush-and-go, fastest for one-off fixes |
| **iOS Photos "Clean Up"** / Google Photos **Magic Eraser** | free on the phone | already on the device the photo came from; good for hands and small shadows |
| **Adobe Firefly API / Replicate SDXL-inpaint** | per-image | only if this ever needs automating in Flock |

### Why Flock does not build this

Inpainting invents pixels. On a resale listing that is a **misrepresentation
risk**: erase a shadow and you may erase a crease, a stain, or the mark that
made the piece "good" rather than "excellent". Flock's whole position is that
a wrong claim is worse than a blank field — an image that quietly removes a
flaw is the same failure with better lighting.

Cropping and a clean background are presentation. Editing the garment itself
is not, and it stays a deliberate act the seller performs in a tool they chose.

**The cheapest fix is almost always the reshoot**: put the garment flat on a
bed or floor, both hands out of frame, and the problem never exists. Failing
that, phone Clean Up takes about ten seconds and costs nothing.
