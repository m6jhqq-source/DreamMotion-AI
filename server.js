
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const API = "https://api.magichour.ai";
const DATA = path.join(__dirname, "data");
const UPLOADS = path.join(__dirname, "public", "uploads");

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(UPLOADS));

const dbFile = path.join(DATA, "jobs.json");
const readJobs = () => {
  try { return JSON.parse(fs.readFileSync(dbFile, "utf8")); }
  catch { return []; }
};
const writeJobs = jobs =>
  fs.writeFileSync(dbFile, JSON.stringify(jobs, null, 2));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

async function magicRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.MAGIC_HOUR_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch {}

  if (!response.ok) {
    throw new Error(
      `Magic Hour (${response.status}): ${data.message || raw}`
    );
  }
  return data;
}

app.get("/api/config", (_req, res) => {
  const ready = Boolean(process.env.MAGIC_HOUR_API_KEY);
  res.json({
    provider: ready ? "Magic Hour" : "demo",
    ready
  });
});

app.get("/api/jobs", (_req, res) => {
  res.json(readJobs().slice(0, 50));
});

app.post("/api/generate", upload.single("image"), async (req, res) => {
  const prompt = String(req.body.prompt || "").trim();

  if (!prompt)
    return res.status(400).json({ error: "اكتب وصف الفيديو أولاً." });

  if (!process.env.MAGIC_HOUR_API_KEY)
    return res.status(503).json({
      error: "مفتاح Magic Hour غير مضبوط في Railway."
    });

  try {
    const image = req.file;
    const ratio = ["9:16", "16:9", "1:1"].includes(req.body.ratio)
      ? req.body.ratio : "9:16";

    // نستخدم إعداداً مناسباً كبداية لتجنب اختيار موديل غير مدعوم.
    const resolution = ["480p", "720p"].includes(req.body.quality)
      ? req.body.quality : "480p";

    let endpoint = "/v1/text-to-video";
    let payload = {
      name: "DreamMotion AI",
      end_seconds: 5,
      aspect_ratio: ratio,
      resolution,
      model: "ltx-2.3",
      style: { prompt }
    };

    if (image) {
      const ext = (image.originalname.split(".").pop() || "jpg")
        .toLowerCase();

      const allowed = [
        "png", "jpg", "jpeg", "webp", "heic",
        "heif", "avif", "bmp", "tiff", "tif"
      ];

      if (!allowed.includes(ext))
        return res.status(400).json({ error: "صيغة الصورة غير مدعومة." });

      const uploaded = await magicRequest(
        `${API}/v1/files/upload-urls`,
        {
          method: "POST",
          body: JSON.stringify({
            items: [{ type: "image", extension: ext }]
          })
        }
      );

      const asset = uploaded.items?.[0];

      if (!asset?.upload_url || !asset?.file_path)
        throw new Error("تعذر الحصول على رابط رفع الصورة.");

      const put = await fetch(asset.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": image.mimetype || "application/octet-stream"
        },
        body: image.buffer
      });

      if (!put.ok)
        throw new Error("فشل رفع الصورة إلى Magic Hour.");

      endpoint = "/v1/image-to-video";
      payload = {
        name: "DreamMotion AI Image",
        end_seconds: 5,
        model: "ltx-2.3",
        resolution,
        style: { prompt },
        assets: { image_file_path: asset.file_path }
      };
    }

    const created = await magicRequest(`${API}${endpoint}`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (!created.id)
      throw new Error("لم يصل معرّف مشروع الفيديو.");

    let project = null;

    for (let i = 0; i < 120; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      project = await magicRequest(
        `${API}/v1/video-projects/${encodeURIComponent(created.id)}`,
        { headers: {} }
      );

      if (project.status === "complete") break;

      if (project.status === "error" ||
          project.status === "canceled") {
        throw new Error("فشل توليد الفيديو: " +
          JSON.stringify(project.error));
      }
    }

    if (project?.status !== "complete" ||
        !project.downloads?.[0]?.url) {
      return res.status(202).json({
        id: created.id,
        status: "rendering",
        message: "الفيديو ما زال قيد التوليد."
      });
    }

    const videoResponse = await fetch(project.downloads[0].url);

    if (!videoResponse.ok)
      throw new Error("تعذر تنزيل الفيديو النهائي.");

    const bytes = Buffer.from(await videoResponse.arrayBuffer());
    const filename = `${crypto.randomUUID()}.mp4`;

    fs.writeFileSync(path.join(UPLOADS, filename), bytes);

    const job = {
      id: created.id,
      prompt,
      video: `/uploads/${filename}`,
      createdAt: new Date().toISOString(),
      status: "completed"
    };

    const jobs = readJobs();
    jobs.unshift(job);
    writeJobs(jobs);

    res.json(job);

  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`DreamMotion AI running on ${PORT}`);
});
