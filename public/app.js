const $=s=>document.querySelector(s);
const promptEl=$("#prompt"), count=$("#count"), message=$("#message"), button=$("#generate");
promptEl.addEventListener("input",()=>count.textContent=`${promptEl.value.length} / 1200`);
$("#image").addEventListener("change",e=>$("#fileName").textContent=e.target.files[0]?.name||"");
let jobs=[];
async function load(){try{const r=await fetch("/api/jobs");jobs=await r.json();render()}catch{}}
function render(){const grid=$("#galleryGrid");if(!jobs.length){grid.innerHTML='<div class="empty"><span>▧</span><b>لا توجد فيديوهات بعد</b><small>ستجد مشاريعك هنا بعد إتمام التوليد.</small></div>';return}
grid.innerHTML=jobs.map(j=>`<article class="video-card"><video controls src="${j.video}"></video><p>${escapeHtml(j.prompt)}</p><a href="${j.video}" download>تحميل الفيديو ↓</a></article>`).join("")}
function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
button.addEventListener("click",async()=>{
 message.textContent="";const prompt=promptEl.value.trim();if(!prompt){message.textContent="اكتب وصف الفيديو أولاً.";promptEl.focus();return}
 const data=new FormData();data.append("prompt",prompt);data.append("ratio",$("#ratio").value);data.append("quality",$("#quality").value);if($("#image").files[0])data.append("image",$("#image").files[0]);
 button.disabled=true;button.querySelectorAll("span")[1].textContent="جارٍ إرسال الطلب...";
 try{const r=await fetch("/api/generate",{method:"POST",body:data});const result=await r.json();if(!r.ok)throw new Error(result.error||"تعذر إنشاء الفيديو");jobs.unshift(result);render();message.style.color="#a9e8c1";message.textContent="تم إنشاء الفيديو بنجاح.";$("#gallery").scrollIntoView({behavior:"smooth"})}
 catch(e){message.style.color="#ffb9b9";message.textContent=e.message}
 finally{button.disabled=false;button.querySelectorAll("span")[1].textContent="إنشاء الفيديو"}
});
const translations={
 en:{studio:"Studio",gallery:"My Gallery",about:"About",eyebrow:"AI-powered creative studio",headline:'Turn your imagination into a <span>cinematic scene</span>',subhead:"Describe your idea or add an image, and shape your next scene in one place.",createTitle:"Create a new video",demoStatus:"Free demo mode",promptLabel:"Describe the video you imagine",promptHint:"The more precise the prompt, the closer the result to your vision.",imageLabel:"Reference image (optional)",uploadTitle:"Add an image",uploadHint:"PNG or JPG • up to 12MB",ratio:"Aspect ratio",quality:"Requested quality",generate:"Generate video",fineprint:"Preview mode. Real generation requires an available configured video provider.",preview:"Studio preview",previewTitle:"Your story starts here",previewSub:"Write a creative prompt to start your project",galleryTitle:"Your creations",galleryHint:"Generated videos will appear here",emptyTitle:"No videos yet",emptySub:"Your projects will appear here after generation.",aboutTitle:"One space for limitless ideas",aboutText:"DreamMotion AI is a creative interface for exploring AI video creation. This version is deployable and can be connected to a compatible generation provider when access is available.",footer:"Made for creativity • Preview build"},
 ar:null
};
let english=false;
$("#lang").addEventListener("click",()=>{english=!english;document.documentElement.lang=english?"en":"ar";document.documentElement.dir=english?"ltr":"rtl";$("#lang").textContent=english?"عربي":"EN";document.querySelectorAll("[data-i18n]").forEach(el=>{const key=el.dataset.i18n;if(english&&translations.en[key])el.innerHTML=translations.en[key];else if(!english)location.reload()});if(english)promptEl.placeholder="Example: A cinematic shot of a futuristic city at night, neon lights reflecting on wet streets...";else promptEl.placeholder=promptEl.dataset.placeholder;});
load();
