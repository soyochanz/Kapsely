import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const splashSrc = staticFile("android-icon-background.png");

const particleData = [
  { x: 0.12, y: 0.21, size: 10, delay: 12, duration: 52, color: "rgba(255,255,255,0.92)" },
  { x: 0.86, y: 0.18, size: 12, delay: 20, duration: 56, color: "rgba(255,237,251,0.88)" },
  { x: 0.78, y: 0.33, size: 9, delay: 8, duration: 44, color: "rgba(255,255,255,0.8)" },
  { x: 0.21, y: 0.77, size: 12, delay: 18, duration: 48, color: "rgba(255,245,255,0.9)" },
  { x: 0.73, y: 0.82, size: 10, delay: 16, duration: 54, color: "rgba(255,255,255,0.8)" },
  { x: 0.08, y: 0.58, size: 8, delay: 24, duration: 42, color: "rgba(255,233,245,0.82)" },
];

const softArcData = [
  {
    top: "7%",
    left: "63%",
    width: "56%",
    height: "54%",
    borderColor: "rgba(255,255,255,0.34)",
    delay: 12,
  },
  {
    top: "68%",
    left: "-16%",
    width: "86%",
    height: "34%",
    borderColor: "rgba(255,255,255,0.26)",
    delay: 20,
  },
];

const LightParticle: React.FC<{
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
}> = ({ x, y, size, delay, duration, color }) => {
  const frame = useCurrentFrame();
  const appear = spring({
    fps: 30,
    frame: frame - delay,
    config: {
      damping: 200,
      stiffness: 35,
      mass: 1,
    },
  });

  const opacity = interpolate(appear, [0, 0.6, 1], [0, 0.18, 0.7], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const drift = interpolate(frame, [0, duration], [0, -18], {
    extrapolateRight: "extend",
  });
  const scale = interpolate(appear, [0, 1], [0.6, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        width: size,
        height: size,
        borderRadius: "999px",
        background: color,
        transform: `translate(-50%, calc(-50% + ${drift}px)) scale(${scale})`,
        opacity,
        filter: "blur(0.2px)",
        boxShadow: `0 0 ${size * 2.2}px ${color}`,
      }}
    />
  );
};

export const SplashOpeningComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const cameraStart = 8;
  const cameraZoom = spring({
    fps,
    frame: frame - cameraStart,
    config: {
      damping: 90,
      stiffness: 28,
      mass: 1.8,
    },
  });

  const globalZoom = interpolate(cameraZoom, [0, 1], [1, 1.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterLift = interpolate(cameraZoom, [0, 1], [0, -64], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const masterDriftX = interpolate(cameraZoom, [0, 1], [0, 6], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const awaken = spring({
    fps,
    frame: frame - 10,
    config: {
      damping: 200,
      stiffness: 28,
      mass: 1.8,
    },
  });

  const innerLightOpacity = interpolate(awaken, [0, 0.55, 1], [0, 0.16, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const innerLightScale = interpolate(awaken, [0, 1], [0.92, 1.12], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lidLift = spring({
    fps,
    frame: frame - 28,
    config: {
      damping: 220,
      stiffness: 26,
      mass: 2.1,
    },
  });

  const lidRotate = interpolate(lidLift, [0, 1], [0, -3.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lidTranslateY = interpolate(lidLift, [0, 1], [0, -18], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lidTranslateX = interpolate(lidLift, [0, 1], [0, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lidOpacity = interpolate(frame, [0, 14, 24], [0, 0.35, 1], {
    extrapolateRight: "clamp",
  });

  const glowPulse = 1 + Math.sin(frame / 11) * 0.015;
  const sweepShift = interpolate(frame, [18, 78], [-26, 42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const bloomOpacity = interpolate(frame, [24, 54, 82], [0, 0.18, 0.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const hazeOpacity = interpolate(frame, [0, 10, 36], [0, 0, 0.06], {
    extrapolateRight: "clamp",
  });

  const finalWash = interpolate(frame, [durationInFrames - 18, durationInFrames - 1], [0, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const transitionStart = durationInFrames - 26;
  const transitionProgress = spring({
    fps,
    frame: frame - transitionStart,
    config: {
      damping: 200,
      stiffness: 34,
      mass: 1.1,
    },
  });
  const transitionGlowOpacity = interpolate(transitionProgress, [0, 1], [0, 0.95], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const transitionGlowScale = interpolate(transitionProgress, [0, 1], [0.88, 1.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const transitionWashOpacity = interpolate(transitionProgress, [0, 0.45, 1], [0, 0.08, 0.86], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const iconFocusShadow = interpolate(frame, [0, 36, 78], [0, 0.16, 0.24], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#f6f2ff", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `translate(${masterDriftX}px, ${masterLift}px) scale(${globalZoom})`,
          transformOrigin: "50% 65%",
        }}
      >
        <Img
          src={splashSrc}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        {softArcData.map((arc, index) => {
          const arcOpacity = interpolate(frame, [0, arc.delay, arc.delay + 24], [0, 0, 1], {
            extrapolateRight: "clamp",
          });

          return (
            <div
              key={`arc-${index}`}
              style={{
                position: "absolute",
                top: arc.top,
                left: arc.left,
                width: arc.width,
                height: arc.height,
                borderRadius: "999px",
                border: `1px solid ${arc.borderColor}`,
                opacity: arcOpacity * 0.55,
              }}
            />
          );
        })}

        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: innerLightOpacity,
            background:
              "radial-gradient(circle at 50% 60%, rgba(255,168,233,0.58) 0%, rgba(209,148,255,0.42) 18%, rgba(129,190,255,0.22) 34%, rgba(255,255,255,0) 58%)",
            transform: `scale(${innerLightScale * glowPulse})`,
            mixBlendMode: "screen",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: bloomOpacity,
            background:
              "radial-gradient(circle at 51% 62%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 18%, rgba(255,255,255,0) 44%)",
            mixBlendMode: "screen",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: hazeOpacity,
            background:
              "radial-gradient(circle at 52% 61%, rgba(255,255,255,0.68) 0%, rgba(255,255,255,0.18) 26%, rgba(255,255,255,0) 52%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath: "ellipse(24% 9% at 50.5% 53.9%)",
            opacity: interpolate(frame, [0, 20, 64], [0, 0.12, 0.2], {
              extrapolateRight: "clamp",
            }),
            background:
              "radial-gradient(circle at 50% 54%, rgba(126,77,232,0.36) 0%, rgba(219,132,255,0.22) 26%, rgba(255,255,255,0) 66%)",
            mixBlendMode: "multiply",
            transform: `translate(${lidTranslateX * 0.15}px, ${lidTranslateY * 0.15}px)`,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            clipPath:
              "polygon(27.5% 51.7%, 36% 45.6%, 49.5% 41.9%, 63.9% 43.1%, 73.4% 49.2%, 72.1% 54.6%, 63.2% 58.2%, 49.2% 57.9%, 36.1% 55.5%)",
            opacity: lidOpacity * 0.7,
            transform: `translate(${lidTranslateX * 0.22}px, ${lidTranslateY * 0.18}px) rotate(${lidRotate * 0.18}deg)`,
            transformOrigin: "50% 52%",
            background:
              "linear-gradient(118deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0.5) 48%, rgba(255,211,247,0.32) 56%, rgba(255,255,255,0) 72%)",
            backgroundPositionX: `${sweepShift}%`,
            backgroundSize: "160% 100%",
            mixBlendMode: "screen",
            filter: `drop-shadow(0 12px 18px rgba(119, 86, 225, ${iconFocusShadow * 0.9}))`,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 49% 63%, rgba(255,255,255,0) 0%, rgba(255,255,255,0) 9%, rgba(255,186,239,0.16) 13%, rgba(173,199,255,0.08) 24%, rgba(255,255,255,0) 44%)",
            opacity: interpolate(frame, [0, 22, 76], [0, 0.1, 0.18], {
              extrapolateRight: "clamp",
            }),
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: interpolate(frame, [14, 40, 78], [0, 0.08, 0.16], {
              extrapolateRight: "clamp",
            }),
            background:
              "radial-gradient(circle at 50% 52%, rgba(255,255,255,0.5) 0%, rgba(255,211,251,0.18) 16%, rgba(255,255,255,0) 34%)",
            mixBlendMode: "screen",
          }}
        />

        {particleData.map((particle, index) => (
          <LightParticle key={`particle-${index}`} {...particle} />
        ))}

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.01) 52%, rgba(255,255,255,0.14) 100%)",
            opacity: finalWash,
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: transitionGlowOpacity,
            transform: `scale(${transitionGlowScale})`,
            transformOrigin: "50% 65%",
            background:
              "radial-gradient(circle at 50% 64%, rgba(255,193,240,0.75) 0%, rgba(194,154,255,0.58) 20%, rgba(154,214,255,0.42) 36%, rgba(255,255,255,0) 60%)",
            mixBlendMode: "screen",
          }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: transitionWashOpacity,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,248,255,0.35) 38%, rgba(255,255,255,0.95) 100%)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
