/* eslint-disable @remotion/even-dimensions */
import "./index.css";
import { Composition } from "remotion";
import { SplashOpeningComposition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KapselySplashOpen"
        component={SplashOpeningComposition}
        durationInFrames={108}
        fps={30}
        width={853}
        height={1844}
      />
    </>
  );
};
