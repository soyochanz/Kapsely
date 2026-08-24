import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type AppVideoProps = {
    uri: string;
    style?: StyleProp<ViewStyle>;
    contentFit?: 'contain' | 'cover' | 'fill';
    nativeControls?: boolean;
    shouldPlay?: boolean;
    loop?: boolean;
    muted?: boolean;
    volume?: number;
    startPositionMillis?: number;
    endPositionMillis?: number | null;
};

/** Shared expo-video adapter so playback behavior stays consistent across the app. */
export default function AppVideo({
    uri,
    style,
    contentFit = 'contain',
    nativeControls = true,
    shouldPlay = false,
    loop = false,
    muted = false,
    volume = 1,
    startPositionMillis = 0,
    endPositionMillis = null,
}: AppVideoProps) {
    const player = useVideoPlayer(uri, instance => {
        instance.loop = loop;
        instance.muted = muted;
        instance.volume = volume;
        instance.currentTime = startPositionMillis / 1000;
        if (shouldPlay) instance.play();
    });

    useEffect(() => {
        player.loop = loop;
        player.muted = muted;
        player.volume = volume;
    }, [loop, muted, player, volume]);

    useEffect(() => {
        if (shouldPlay) player.play();
        else player.pause();
    }, [player, shouldPlay]);

    useEffect(() => {
        player.currentTime = startPositionMillis / 1000;
    }, [player, startPositionMillis]);

    useEffect(() => {
        if (!shouldPlay || !endPositionMillis) return;
        const timer = setInterval(() => {
            if (player.currentTime * 1000 >= endPositionMillis) {
                player.pause();
                player.currentTime = startPositionMillis / 1000;
            }
        }, 250);
        return () => clearInterval(timer);
    }, [endPositionMillis, player, shouldPlay, startPositionMillis]);

    return (
        <VideoView
            player={player}
            style={style}
            contentFit={contentFit}
            nativeControls={nativeControls}
            playsInline
        />
    );
}
