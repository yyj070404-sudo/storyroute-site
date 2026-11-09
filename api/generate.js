// Vercel 서버리스 함수 (Google Gemini 무료 API 사용)
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const OK = {
  hours: ["2", "3", "5", "8", "10", "12"],
  start: ["08:00", "09:00", "10:00", "11:00", "13:00", "15:00", "17:00", "19:00"],
  who: ["혼자", "연인", "친구", "가족"],
  move: ["도보+대중교통", "자차/렌터카", "택시"],
  tone: ["여유로운 힐링", "알찬 핫플 탐방", "낭만적인 밤 감성"],
  theme: ["감성 카페 & 디저트", "자연/힐링/야경 산책", "역사/문화재/도슨트", "핫플/인생샷 사진 스팟", "로컬 마켓/쇼핑/골목 탐방"],
  food: ["한식", "중식", "일식", "양식", "분식·길거리 음식", "동남아·아시안", "해산물", "고기·구이"],
};

const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const fmt = (n) => { n = ((n % 1440) + 1440) % 1440; return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"); };
const overlap = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

// 일정이 식사 시간대(점심 11:30~13:30, 저녁 17:30~19:30)와 60분 이상 겹치면 식사를 넣는다.
function mealPlan(startMin, endMin) {
  const meals = [];
  if (overlap(startMin, endMin, 11 * 60 + 30, 13 * 60 + 30) >= 60) meals.push({ name: "점심", window: "11:30~13:30" });
  if (overlap(startMin, endMin, 17 * 60 + 30, 19 * 60 + 30) >= 60) meals.push({ name: "저녁", window: "17:30~19:30" });
  return meals;
}

function buildPrompt(m) {
  const hours = Number(m.hours);
  const startMin = toMin(m.start);
  const endMin = startMin + hours * 60;
  const meals = mealPlan(startMin, endMin);
  const stops = Math.max(2, Math.min(7, Math.round((hours - meals.length) / 1.6)));
  const mealText = meals.length
    ? `식사: ${meals.map((x) => `${x.name}(권장 ${x.window}, 일정 시간 안에서 흐름에 맞는 시각 선택)`).join(", ")} 식사를 각각 type이 "meal"인 카드로 일정에 넣으세요.`
    : "식사: 식사 시간대와 겹치지 않으니 type이 \"meal\"인 카드는 넣지 마세요.";
  return (
    "당신은 국내 및 해외 도시의 로컬 문화와 동선을 완벽히 파악하고 있는 스토리텔링 전문 여행 에디터입니다. " +
    "아래 조건에 맞춰, 단순 장소 추천을 넘어 [장소 ↔ 이동 ↔ 장소]가 매끄럽게 연결되는 1일 데일리케이션 카드뉴스 리플렛 데이터를 한국어로 작성하세요. " +
    "장소마다 문화·역사적 비하인드 스토리, 현지 이용 팁, 구체적인 사진 촬영 구도(Photo Guide)를 넣고, " +
    "장소와 장소 사이의 중간 일정(이동 수단, 이동 시간, 이동 중 볼거리·감성 포인트)을 반드시 독립된 항목으로 넣으세요.\n" +
    `도시/지역: ${m.city}\n일정: ${m.start}부터 ${hours}시간 (종료 ${fmt(endMin)})\n동행: ${m.who}\n이동 수단: ${m.move}\n` +
    `취향 테마: ${m.themes.join(", ") || "자유"}\n음식 취향: ${m.foods.join(", ") || "상관없음"}\n톤앤매너: ${m.tone}\n${mealText}\n\n` +
    `규칙: cards 배열은 장소(place 또는 meal)와 transit이 번갈아 나오며 첫 카드와 마지막 카드는 place 또는 meal입니다. 식사를 제외한 place는 ${stops}개입니다. ` +
    "모든 time은 HH:MM 형식으로 시간순이며 일정 시작 시각 이후, 종료 시각 이전이어야 하고 이동 시간과 체류 시간이 현실적이어야 합니다. " +
    "place: name(장소명), local(현지 명칭, 해외면 현지어 병기, 국내면 영문 표기 또는 빈 문자열), time, story(역사·문화·브랜드 비하인드 2~3문장), tip(도슨트 시간, 무료 입장, 대기 줄이는 법 등 실용 팁), photo(Photo Guide: 어디에 서서 어떤 구도·각도로 찍으면 인생샷이 나오는지 구체적 설명). " +
    "meal: meal(\"점심\" 또는 \"저녁\"), name(식당 또는 먹거리 장소명), local, time, cuisine(음식 종류, 음식 취향을 반영), menu(대표 추천 메뉴 2~3가지), tip(웨이팅·예약·영업시간 확인 등 실용 팁). " +
    "transit: method(이동 수단과 노선·정거장), duration(이동 시간), story(이동 중 볼거리와 감성 포인트 2문장, 앞 장소의 여운에서 다음 장소로 자연스럽게 이어지게). " +
    "이동 수단 설정과 동선이 맞아야 하며, 실제로 존재하는 장소만 쓰고 불확실한 세부 정보(운영 시간, 요금, 휴무일)는 확인을 권하는 표현을 쓰세요. " +
    "JSON만 출력하고 코드 펜스나 설명은 쓰지 마세요. 형식: " +
    '{"title":"","intro":"","cards":[{"type":"place","name":"","local":"","time":"","story":"","tip":"","photo":""},{"type":"transit","method":"","duration":"","story":""},{"type":"meal","meal":"","name":"","local":"","time":"","cuisine":"","menu":"","tip":""}]}'
  );
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어요." });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const pick = (k, d) => (OK[k].includes(b[k]) ? b[k] : d || OK[k][0]);
  const m = {
    hours: pick("hours", "10"), start: pick("start", "10:00"), who: pick("who"), move: pick("move"), tone: pick("tone"),
    city: String(b.city || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40),
    themes: Array.isArray(b.themes) ? b.themes.filter((t) => OK.theme.includes(t)) : [],
    foods: Array.isArray(b.foods) ? b.foods.filter((t) => OK.food.includes(t)) : [],
  };
  if (!m.city) return res.status(400).json({ error: "도시를 입력해 주세요." });

  const FALLBACK = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
  const plan = [
    { model: MODEL, ms: 20000 },
    { model: MODEL, ms: 18000 },
    { model: FALLBACK, ms: 14000 },
  ];
  const prompt = buildPrompt(m);
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  let lastErr = "알 수 없는 오류";

  for (let i = 0; i < plan.length; i++) {
    const { model, ms } = plan[i];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: ctrl.signal,
          headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8000, temperature: 0.8 },
          }),
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const st = data && data.error && data.error.status ? " " + data.error.status : "";
        lastErr = `AI 호출 실패 (${r.status}${st}, 모델 ${model})`;
        console.error("Gemini error", r.status, model, JSON.stringify(data).slice(0, 400));
        if (r.status === 400 || r.status === 401) break; // 재시도해도 같은 결과
        if ((r.status === 403 || r.status === 404) && i < plan.length - 1) { i = plan.length - 2; continue; } // 모델을 못 쓰면 대체 모델로
        await sleep(700 * (i + 1));
        continue;
      }
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const text = parts.map((p) => p.text || "").join("").replace(/```json|```/g, "").trim();
      if (cand && cand.finishReason === "MAX_TOKENS") { lastErr = "답이 길어 중간에 잘렸어요"; console.error("MAX_TOKENS", model); await sleep(500); continue; }
      const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (!out || !Array.isArray(out.cards) || !out.cards.length) { lastErr = "응답에 일정 카드가 없어요"; continue; }
      return res.status(200).json(out);
    } catch (e) {
      lastErr = e && e.name === "AbortError" ? "AI 응답이 늦어 중단됐어요" : "AI 응답 형식 오류";
      console.error("generate error", model, e && e.message);
      await sleep(500);
    } finally {
      clearTimeout(timer);
    }
  }
  return res.status(502).json({ error: lastErr });
}

handler.config = { maxDuration: 60 };
module.exports = handler;
