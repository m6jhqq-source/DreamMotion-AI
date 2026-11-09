import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data");
const UPLOADS = path.join(__dirname, "public", "uploads");
fs.mkdirSync(DATA, {recursive:true});
fs.mkdirSync(UPLOADS, {recursive:true});
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));
app.use("/uploads", express.static(UPLOADS));

const dbFile = path.join(DATA,"jobs.json");
const readJobs = () => { try { return JSON.parse(fs.readFileSync(dbFile,"utf8")); } catch { return []; } };
const writeJobs = jobs => fs.writeFileSync(dbFile, JSON.stringify(jobs,null,2));
const upload = multer({dest: UPLOADS, limits:{fileSize:12*1024*1024}});

app.get("/api/config", (_req,res) => res.json({
  provider: process.env.VIDEO_PROVIDER || "demo",
  ready: Boolean(process.env.HF_TOKEN && process.env.HF_MODEL_URL),
  note: "Demo mode is free but does not generate real AI video. A compatible inference endpoint and token are required for real generation."
}));

app.get("/api/jobs", (_req,res) => res.json(readJobs().slice(0,50)));

app.post("/api/generate", upload.single("image"), async (req,res) => {
  const prompt = String(req.body.prompt || "").trim();
  if (!prompt) return res.status(400).json({error:"اكتب وصف الفيديو أولاً."});
  const provider = process.env.VIDEO_PROVIDER || "demo";
  if (provider !== "huggingface" || !process.env.HF_TOKEN || !process.env.HF_MODEL_URL) {
    return res.status(503).json({
      error:"وضع العرض المجاني مفعّل. الموقع جاهز، لكن توليد فيديو AI حقيقي يحتاج خدمة استدلال مجانية متاحة ومفتاحها. لا يوجد مفتاح أو خدمة توليد مهيأة حالياً."
    });
  }
  try {
    const payload = {inputs: prompt};
    const response = await fetch(process.env.HF_MODEL_URL, {
      method:"POST",
      headers:{"Authorization":`Bearer ${process.env.HF_TOKEN}`,"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({error:`خدمة التوليد لم تقبل الطلب (${response.status}). ${detail.slice(0,250)}`});
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.headers.get("content-type")?.includes("video") && bytes.length < 1000) {
      return res.status(502).json({error:"الاستجابة لم تكن ملف فيديو صالحاً."});
    }
    const name = `${crypto.randomUUID()}.mp4`;
    fs.writeFileSync(path.join(UPLOADS,name),bytes);
    const jobs = readJobs();
    const job = {id:crypto.randomUUID(),prompt,video:`/uploads/${name}`,createdAt:new Date().toISOString(),status:"completed"};
    jobs.unshift(job); writeJobs(jobs);
    res.json(job);
  } catch (e) {
    res.status(500).json({error:"تعذر الاتصال بخدمة التوليد: "+e.message});
  }
});

app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`DreamMotion AI running on ${PORT}`));
