// Vercel 서버리스 함수 (Google Gemini 무료 API 사용)
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const OK = {
  region: ["국내", "해외"],
  time: ["반일 5시간", "전일 10시간"],
  who: ["혼자", "연인", "친구", "가족"],
  move: ["도보+대중교통", "자차/렌터카", "택시"],
  tone: ["여유로운 힐링", "알찬 핫플 탐방", "낭만적인 밤 감성"],
  theme: ["감성 카페 & 디저트", "자연/힐링/야경 산책", "역사/문화재/도슨트", "핫플/인생샷 사진 스팟", "로컬 마켓/쇼핑/골목 탐방"],
};

function buildPrompt(m) {
  const half = m.time.startsWith("반일");
  return (
    "당신은 국내 및 해외 도시의 로컬 문화와 동선을 완벽히 파악하고 있는 스토리텔링 전문 여행 에디터입니다. " +
    "아래 조건에 맞춰, 단순 장소 추천을 넘어 [장소 ↔ 이동 ↔ 장소]가 매끄럽게 연결되는 1일 데일리케이션 카드뉴스 리플렛 데이터를 한국어로 작성하세요. " +
    "장소마다 문화·역사적 비하인드 스토리, 현지 이용 팁, 구체적인 사진 촬영 구도(Photo Guide)를 넣고, " +
    "장소와 장소 사이의 중간 일정(이동 수단, 이동 시간, 이동 중 볼거리·감성 포인트)을 반드시 독립된 항목으로 넣으세요.\n" +
    `지역: ${m.region} / 도시: ${m.city}\n가용 시간: ${m.time}\n동행: ${m.who}\n이동 수단: ${m.move}\n` +
    `취향 테마: ${m.themes.join(", ") || "자유"}\n톤앤매너: ${m.tone}\n\n` +
    `규칙: cards 배열은 place와 transit이 번갈아 나오며 첫 카드와 마지막 카드는 place입니다. place는 ${half ? "3~4" : "5~6"}개입니다. ` +
    "place: name(장소명), local(현지 명칭, 해외면 현지어 병기, 국내면 영문 표기 또는 빈 문자열), time(방문 시각), story(역사·문화·브랜드 비하인드 2~3문장), tip(도슨트 시간, 무료 입장, 대기 줄이는 법 등 실용 팁), photo(Photo Guide: 어디에 서서 어떤 구도·각도로 찍으면 인생샷이 나오는지 구체적 설명). " +
    "transit: method(이동 수단과 노선·정거장), duration(이동 시간), story(이동 중 볼거리와 감성 포인트 2문장, 앞 장소의 여운에서 다음 장소로 자연스럽게 이어지게). " +
    "이동 수단 설정과 동선이 맞아야 하며, 실제로 존재하는 장소만 쓰고 불확실한 세부 정보(운영 시간, 요금)는 확인을 권하는 표현을 쓰세요. " +
    "JSON만 출력하고 코드 펜스나 설명은 쓰지 마세요. 형식: " +
    '{"title":"","intro":"","cards":[{"type":"place","name":"","local":"","time":"","story":"","tip":"","photo":""},{"type":"transit","method":"","duration":"","story":""}]}'
  );
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "서버에 API 키가 설정되지 않았어요." });

  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const pick = (k) => (OK[k].includes(b[k]) ? b[k] : OK[k][0]);
  const m = {
    region: pick("region"), time: pick("time"), who: pick("who"), move: pick("move"), tone: pick("tone"),
    city: String(b.city || "").replace(/[\r\n]+/g, " ").trim().slice(0, 40),
    themes: Array.isArray(b.themes) ? b.themes.filter((t) => OK.theme.includes(t)) : [],
  };
  if (!m.city) return res.status(400).json({ error: "도시를 입력해 주세요." });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(m) }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 4000, temperature: 0.8 },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: "AI 호출 실패" });
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const text = parts.map((p) => p.text || "").join("").replace(/```json|```/g, "").trim();
    const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "생성 중 오류가 발생했어요." });
  }
}

handler.config = { maxDuration: 60 };
module.exports = handler;
