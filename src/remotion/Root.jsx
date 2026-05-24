import React from "react";
import { Composition } from "remotion";
import { ScriptVideo } from "./ScriptVideo.jsx";
import {
  FPS,
  demoProject,
  getProjectDimensions,
  getProjectFrames,
} from "../lib/video.js";

export const RemotionRoot = () => {
  return (
    <Composition
      id="ScriptVideo"
      component={ScriptVideo}
      durationInFrames={getProjectFrames(demoProject)}
      fps={FPS}
      width={getProjectDimensions(demoProject.aspectRatio).width}
      height={getProjectDimensions(demoProject.aspectRatio).height}
      defaultProps={{ project: demoProject }}
      calculateMetadata={({ props }) => {
        const project = props.project ?? demoProject;
        const dimensions = getProjectDimensions(project.aspectRatio);
        return {
          durationInFrames: getProjectFrames(project),
          width: dimensions.width,
          height: dimensions.height,
          fps: FPS,
          props: { project },
        };
      }}
    />
  );
};
