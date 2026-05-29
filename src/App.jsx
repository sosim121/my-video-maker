import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  ASPECTS,
  FPS,
  demoProject,
  getProjectDimensions,
  getProjectFrames,
} from "./lib/video.js";

const Player = lazy(() =>
  import("@remotion/player").then((m) => ({ default: m.Player })),
);
const ScriptVideo = lazy(() =>
  import("./remotion/ScriptVideo.jsx").then((m) => ({ default: m.ScriptVideo })),
);

const defaultScript =
  "오늘은 로컬에서 무료로 영상을 만드는 방법을 보여드리겠습니다. 스크립트를 넣으면 자막과 음성이 먼저 만들어집니다. 이후 원하는 이미지와 영상을 장면마다 넣고 mp4로 내보낼 수 있습니다.";

// Helper to count characters and detect English vs Korean (module scope: stable, off the render hot path)
const isEnglishText = (text) => {
  const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
  const koreanCount = (text.match(/[가-힣]/g) || []).length;
  return englishCount > koreanCount;
};

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
  // Latest project, readable from stable (useCallback) handlers without adding `project` as a dep.
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  // Holds the pending debounced PATCH timer so rapid scene edits coalesce into one request.
  const saveTimerRef = useRef(null);

  const previewProject = useMemo(
    () => project ?? { ...demoProject, aspectRatio },
    [project, aspectRatio],
  );
  const dimensions = useMemo(
    () => getProjectDimensions(previewProject.aspectRatio),
    [previewProject.aspectRatio],
  );
  const durationInFrames = useMemo(() => getProjectFrames(previewProject), [previewProject]);
  const playerInputProps = useMemo(() => ({ project: previewProject }), [previewProject]);

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

  // Keep latest selectedVoice readable from the debounced detector without resetting its timer.
  const selectedVoiceRef = useRef(selectedVoice);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  // Auto-detect language and set appropriate voice dynamically.
  // Debounced ~300ms so the regex scans run after typing stops, not on every keystroke.
  useEffect(() => {
    if (voices.length === 0) return;

    const timer = window.setTimeout(() => {
      const detectedEn = isEnglishText(script);
      const targetLang = detectedEn ? "en" : "ko";

      const currentVoiceObj = voices.find((v) => v.name === selectedVoiceRef.current);
      if (!currentVoiceObj || !currentVoiceObj.culture?.toLowerCase().startsWith(targetLang)) {
        const matchedVoice = voices.find((v) =>
          v.culture?.toLowerCase().startsWith(targetLang)
        );
        if (matchedVoice) {
          setSelectedVoice(matchedVoice.name);
        }
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [script, voices]);

  useEffect(() => {
    if (!render || ["completed", "failed"].includes(render.status)) {
      return;
    }

    let aborted = false;
    let timer;
    let attempt = 0;

    const poll = async () => {
      let data;
      try {
        data = await api(`/api/renders/${render.id}`);
      } catch {
        if (aborted) return;
        attempt += 1;
        timer = window.setTimeout(poll, Math.min(1200 + attempt * 400, 5000));
        return;
      }
      if (aborted) return;

      // Terminal states: do all the work, THEN setRender last. setRender flips
      // render.status, which re-runs this effect; doing it last means the effect's
      // cleanup can't abort the in-flight completion handling above.
      if (data.render.status === "completed") {
        let refreshed;
        try {
          refreshed = await api(`/api/projects/${data.render.projectId}`);
        } catch {
          /* keep going — render itself succeeded */
        }
        if (aborted) return;
        if (refreshed) setProject(refreshed.project);
        setStatus("mp4가 완성되었습니다.");
        setRender(data.render);
        return;
      }
      if (data.render.status === "failed") {
        setStatus("");
        setError(data.render.error || "렌더링에 실패했습니다.");
        setRender(data.render);
        return;
      }

      // Still rendering: update progress (same status → effect won't re-run) and
      // keep polling with light linear backoff: 1.2s base, +0.4s/attempt, capped 5s.
      setRender(data.render);
      attempt += 1;
      timer = window.setTimeout(poll, Math.min(1200 + attempt * 400, 5000));
    };

    timer = window.setTimeout(poll, 1200);

    return () => {
      aborted = true;
      window.clearTimeout(timer);
    };
    // Depend only on id/status — progress updates from poll() shouldn't tear down
    // and recreate the effect (which would reset the backoff every tick).
  }, [render?.id, render?.status]);

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

  const uploadSceneMedia = useCallback(async (sceneId, file) => {
    const current = projectRef.current;
    if (!current || !file) {
      return;
    }
    setError("");
    setStatus("장면에 미디어를 넣는 중입니다.");
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await api(`/api/projects/${current.id}/scenes/${sceneId}/media`, {
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
  }, []);

  const saveProjectEdits = useCallback(async (nextProject = projectRef.current) => {
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
  }, []);

  // Debounced PATCH save (~500ms): rapid blur/duration/fitMode edits coalesce into one request,
  // and the timer always flushes the latest project (read from projectRef at fire time).
  const debouncedSaveProjectEdits = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      saveProjectEdits();
    }, 500);
  }, [saveProjectEdits]);

  // Cancel any pending debounced save on unmount.
  useEffect(() => () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
  }, []);

  const updateScene = useCallback((sceneId, patch) => {
    setProject((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, ...patch } : scene,
        ),
      };
    });
  }, []);

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
    const current = projectRef.current;
    if (current) {
      await saveProjectEdits({ ...current, aspectRatio: nextAspect });
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
          <div className="warning-box">
            ⚠️ 엔터(줄바꿈)를 기준으로 자막과 장면이 나누어집니다. 한 줄이 너무 길면 자막과 음성(TTS)이 너무 길게 재생되므로, 적절히 줄바꿈(엔터)을 해가며 대본을 작성해 주세요.
          </div>
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
            <Suspense fallback={<div className="preview-frame" />}>
              <Player
                component={ScriptVideo}
                inputProps={playerInputProps}
                durationInFrames={durationInFrames}
                compositionWidth={dimensions.width}
                compositionHeight={dimensions.height}
                fps={FPS}
                controls
                style={{ width: "100%", height: "100%" }}
              />
            </Suspense>
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
                  sceneId={scene.id}
                  scene={scene}
                  index={index}
                  asset={project.assets?.[scene.mediaAssetId]}
                  onChange={updateScene}
                  onSave={debouncedSaveProjectEdits}
                  onUpload={uploadSceneMedia}
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

const SceneEditor = React.memo(({ sceneId, scene, index, asset, onChange, onSave, onUpload }) => {
  const inputRef = useRef(null);

  return (
    <article className="scene-item">
      <div className="scene-topline">
        <span>장면 {index + 1}</span>
        <span>{Number(scene.start).toFixed(1)}s</span>
      </div>
      <textarea
        value={scene.text}
        onChange={(event) => onChange(sceneId, { text: event.target.value })}
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
            onChange={(event) => onChange(sceneId, { duration: Number(event.target.value) })}
            onBlur={onSave}
          />
        </label>
        <label>
          맞춤
          <select
            value={scene.fitMode}
            onChange={(event) => {
              onChange(sceneId, { fitMode: event.target.value });
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
        onChange={(event) => onUpload(sceneId, event.target.files?.[0])}
      />
      <button className="media-button" onClick={() => inputRef.current?.click()}>
        <Upload size={17} />
        {asset ? asset.originalName : "이미지/영상 넣기"}
      </button>
    </article>
  );
});

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
