import React, { useEffect, useMemo, useRef, useState } from "react";
import { Player } from "@remotion/player";
import {
  Ban,
  Download,
  Film,
  ImagePlus,
  Loader2,
  MonitorPlay,
  RectangleHorizontal,
  RectangleVertical,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { ScriptVideo } from "./remotion/ScriptVideo.jsx";
import {
  ASPECTS,
  FPS,
  demoProject,
  getProjectDimensions,
  getProjectFrames,
} from "./lib/video.js";

const defaultScript =
  "오늘은 로컬에서 무료로 영상을 만드는 방법을 보여드리겠습니다. 스크립트를 넣으면 자막과 음성이 먼저 만들어집니다. 이후 원하는 이미지와 영상을 장면마다 넣고 mp4로 내보낼 수 있습니다.";

export const App = () => {
  const [script, setScript] = useState(defaultScript);
  const [aspectRatio, setAspectRatio] = useState("portrait");
  const [project, setProject] = useState(null);
  const [voices, setVoices] = useState([]);
  const [selectedVoice, setSelectedVoice] = useState("Google Translate Korean");
  const [status, setStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [render, setRender] = useState(null);
  const [error, setError] = useState("");
  const narrationInputRef = useRef(null);

  const previewProject = project ?? { ...demoProject, aspectRatio };
  const dimensions = useMemo(
    () => getProjectDimensions(previewProject.aspectRatio),
    [previewProject.aspectRatio],
  );
  const durationInFrames = useMemo(() => getProjectFrames(previewProject), [previewProject]);

  // Helper to count characters and detect English vs Korean
  const isEnglishText = (text) => {
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    const koreanCount = (text.match(/[\uac00-\ud7a3]/g) || []).length;
    return englishCount > koreanCount;
  };

  useEffect(() => {
    fetch("/api/voices")
      .then((res) => res.json())
      .then((data) => {
        const fetchedVoices = data.voices ?? [];
        setVoices(fetchedVoices);
        const detectedEn = isEnglishText(script);
        const targetLang = detectedEn ? "en" : "ko";
        const matchedVoice = fetchedVoices.find((voice) =>
          voice.culture?.toLowerCase().startsWith(targetLang)
        );
        if (matchedVoice) {
          setSelectedVoice(matchedVoice.name);
        } else if (fetchedVoices[0]) {
          setSelectedVoice(fetchedVoices[0].name);
        }
      })
      .catch(() => {
        setVoices([]);
      });
  }, []);

  // Auto-detect language and set appropriate voice dynamically
  useEffect(() => {
    if (voices.length === 0) return;

    const detectedEn = isEnglishText(script);
    const targetLang = detectedEn ? "en" : "ko";

    const currentVoiceObj = voices.find((v) => v.name === selectedVoice);
    if (!currentVoiceObj || !currentVoiceObj.culture?.toLowerCase().startsWith(targetLang)) {
      const matchedVoice = voices.find((v) =>
        v.culture?.toLowerCase().startsWith(targetLang)
      );
      if (matchedVoice) {
        setSelectedVoice(matchedVoice.name);
      }
    }
  }, [script, voices]);

  useEffect(() => {
    if (!render || ["completed", "failed"].includes(render.status)) {
      return;
    }

    const timer = window.setInterval(async () => {
      const data = await api(`/api/renders/${render.id}`);
      setRender(data.render);
      if (data.render.status === "completed") {
        const refreshed = await api(`/api/projects/${data.render.projectId}`);
        setProject(refreshed.project);
        setStatus("mp4가 완성되었습니다.");
      }
      if (data.render.status === "failed") {
        setStatus("");
        setError(data.render.error || "렌더링에 실패했습니다.");
      }
    }, 1200);

    return () => window.clearInterval(timer);
  }, [render]);

  const createProject = async () => {
    setError("");
    setIsBusy(true);
    setStatus("스크립트를 장면으로 나누는 중입니다.");
    try {
      const data = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ script, aspectRatio }),
      });
      setProject(data.project);
      setStatus(`${data.project.scenes.length}개 장면이 준비되었습니다.`);
      return data.project;
    } finally {
      setIsBusy(false);
    }
  };

  const generateInitialVideo = async () => {
    setError("");
    setIsBusy(true);
    try {
      let current = project;
      if (!current) {
        setStatus("스크립트를 장면으로 나누는 중입니다.");
        const created = await api("/api/projects", {
          method: "POST",
          body: JSON.stringify({ script, aspectRatio }),
        });
        current = created.project;
        setProject(current);
      }

      setStatus("로컬 한국어 음성을 만드는 중입니다.");
      const data = await api(`/api/projects/${current.id}/tts`, {
        method: "POST",
        body: JSON.stringify({ voiceName: selectedVoice }),
      });
      setProject(data.project);
      setStatus("초기 영상이 준비되었습니다.");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsBusy(false);
    }
  };

  const uploadNarration = async (file) => {
    if (!project || !file) {
      return;
    }
    setError("");
    setIsBusy(true);
    setStatus("업로드한 음성에 맞춰 장면 시간을 배분하는 중입니다.");
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api(`/api/projects/${project.id}/narration`, {
        method: "POST",
        body: form,
        json: false,
      });
      setProject(data.project);
      setStatus("업로드한 음성이 적용되었습니다.");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsBusy(false);
      if (narrationInputRef.current) {
        narrationInputRef.current.value = "";
      }
    }
  };

  const uploadSceneMedia = async (sceneId, file) => {
    if (!project || !file) {
      return;
    }
    setError("");
    setStatus("장면에 미디어를 넣는 중입니다.");
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api(`/api/projects/${project.id}/scenes/${sceneId}/media`, {
        method: "POST",
        body: form,
        json: false,
      });
      setProject(data.project);
      setStatus("장면 미디어가 적용되었습니다.");
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
  };

  const saveProjectEdits = async (nextProject = project) => {
    if (!nextProject) {
      return;
    }
    setProject(nextProject);
    try {
      const data = await api(`/api/projects/${nextProject.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          aspectRatio: nextProject.aspectRatio,
          scenes: nextProject.scenes,
          captionStyle: nextProject.captionStyle,
        }),
      });
      setProject(data.project);
      setStatus("수정사항이 저장되었습니다.");
    } catch (err) {
      setError(err.message);
    }
  };

  const updateScene = (sceneId, patch) => {
    if (!project) {
      return;
    }
    const nextProject = {
      ...project,
      scenes: project.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, ...patch } : scene,
      ),
    };
    setProject(nextProject);
  };

  const renderMp4 = async () => {
    if (!project) {
      await generateInitialVideo();
      return;
    }
    setError("");
    setIsBusy(true);
    setStatus("mp4 렌더링을 시작합니다.");
    try {
      const data = await api(`/api/projects/${project.id}/render`, { method: "POST" });
      setRender(data.render);
      setStatus("mp4를 만드는 중입니다.");
    } catch (err) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsBusy(false);
    }
  };

  const changeAspect = async (nextAspect) => {
    setAspectRatio(nextAspect);
    if (project) {
      await saveProjectEdits({ ...project, aspectRatio: nextAspect });
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">로컬 영상 제작 웹앱</p>
          <h1>스크립트로 자막과 음성을 만들고, 미디어를 이어 붙입니다.</h1>
        </div>
        <div className="top-actions">
          <SegmentedAspect value={previewProject.aspectRatio} onChange={changeAspect} />
          <button className="primary-button" onClick={generateInitialVideo} disabled={isBusy}>
            {isBusy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
            초기 영상 생성
          </button>
          <button className="secondary-button" onClick={renderMp4} disabled={isBusy || render?.status === "rendering"}>
            <Film size={18} />
            mp4 내보내기
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="script-pane">
          <div className="pane-heading">
            <MonitorPlay size={19} />
            <h2>스크립트</h2>
          </div>
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            spellCheck={false}
            className="script-input"
          />
          <div className="button-row">
            <button className="secondary-button full" onClick={createProject} disabled={isBusy}>
              <Save size={18} />
              장면 만들기
            </button>
            <input
              ref={narrationInputRef}
              type="file"
              accept="audio/*"
              className="hidden-input"
              onChange={(event) => uploadNarration(event.target.files?.[0])}
            />
            <button
              className="secondary-button full"
              onClick={() => narrationInputRef.current?.click()}
              disabled={!project || isBusy}
            >
              <Ban size={18} />
              전체 음성 넣기
            </button>
          </div>
          <label className="field-label" htmlFor="voice">
            로컬 TTS 음성
          </label>
          <select
            id="voice"
            value={selectedVoice}
            onChange={(event) => setSelectedVoice(event.target.value)}
            className="select-input"
          >
            {(voices.length ? voices : [{ name: "Microsoft Heami Desktop", culture: "ko-KR" }]).map(
              (voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name} {voice.culture ? `(${voice.culture})` : ""}
                </option>
              ),
            )}
          </select>
          <div className="hint-box">
            유료 영상 생성 AI를 쓰지 않습니다. 이 앱은 로컬 음성, 자막, 사용자가 넣은 이미지와 영상만 조합합니다.
          </div>
        </aside>

        <section className="preview-pane">
          <div className="preview-frame" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}>
            <Player
              component={ScriptVideo}
              inputProps={{ project: previewProject }}
              durationInFrames={durationInFrames}
              compositionWidth={dimensions.width}
              compositionHeight={dimensions.height}
              fps={FPS}
              controls
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <div className="status-strip">
            <span>{status || "스크립트를 넣고 초기 영상을 생성해 주세요."}</span>
            {render ? <span>{renderLabel(render)}</span> : null}
          </div>
          {render ? (
            <div className="progress-track" aria-label="렌더링 진행률">
              <div style={{ width: `${Math.round((render.progress ?? 0) * 100)}%` }} />
            </div>
          ) : null}
          {project?.output?.url ? (
            <a className="download-link" href={project.output.url}>
              <Download size={18} />
              완성된 mp4 받기
            </a>
          ) : null}
          {error ? <div className="error-box">{error}</div> : null}
        </section>

        <aside className="scene-pane">
          <div className="pane-heading">
            <ImagePlus size={19} />
            <h2>장면</h2>
          </div>
          <div className="scene-list">
            {(project?.scenes ?? []).length === 0 ? (
              <div className="empty-state">장면을 만들면 여기에 편집 목록이 나타납니다.</div>
            ) : (
              project.scenes.map((scene, index) => (
                <SceneEditor
                  key={scene.id}
                  scene={scene}
                  index={index}
                  asset={project.assets?.[scene.mediaAssetId]}
                  onChange={(patch) => updateScene(scene.id, patch)}
                  onSave={() => saveProjectEdits()}
                  onUpload={(file) => uploadSceneMedia(scene.id, file)}
                />
              ))
            )}
          </div>
        </aside>
      </section>
    </main>
  );
};

const SegmentedAspect = ({ value, onChange }) => (
  <div className="segmented" role="group" aria-label="영상 비율">
    <button className={value === "portrait" ? "active" : ""} onClick={() => onChange("portrait")}>
      <RectangleVertical size={17} />
      {ASPECTS.portrait.label}
    </button>
    <button className={value === "landscape" ? "active" : ""} onClick={() => onChange("landscape")}>
      <RectangleHorizontal size={17} />
      {ASPECTS.landscape.label}
    </button>
  </div>
);

const SceneEditor = ({ scene, index, asset, onChange, onSave, onUpload }) => {
  const inputRef = useRef(null);

  return (
    <article className="scene-item">
      <div className="scene-topline">
        <span>장면 {index + 1}</span>
        <span>{Number(scene.start).toFixed(1)}s</span>
      </div>
      <textarea
        value={scene.text}
        onChange={(event) => onChange({ text: event.target.value })}
        onBlur={onSave}
        className="scene-text"
      />
      <div className="scene-controls">
        <label>
          길이
          <input
            type="number"
            min="0.5"
            step="0.1"
            value={scene.duration}
            onChange={(event) => onChange({ duration: Number(event.target.value) })}
            onBlur={onSave}
          />
        </label>
        <label>
          맞춤
          <select
            value={scene.fitMode}
            onChange={(event) => {
              onChange({ fitMode: event.target.value });
              window.setTimeout(onSave, 0);
            }}
          >
            <option value="cover">채우기</option>
            <option value="contain">전체 보기</option>
          </select>
        </label>
      </div>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*,video/*"
        onChange={(event) => onUpload(event.target.files?.[0])}
      />
      <button className="media-button" onClick={() => inputRef.current?.click()}>
        <Upload size={17} />
        {asset ? asset.originalName : "이미지/영상 넣기"}
      </button>
    </article>
  );
};

function renderLabel(render) {
  if (render.status === "failed") {
    return "렌더링 실패";
  }
  if (render.status === "completed") {
    return "100%";
  }
  return `${Math.round((render.progress ?? 0) * 100)}%`;
}

async function api(url, options = {}) {
  const { json = true, ...rest } = options;
  const response = await fetch(url, {
    headers: json ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    ...rest,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  }
  return data;
}
