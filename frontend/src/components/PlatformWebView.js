import React from "react";
import { Platform, View, StyleSheet, TouchableOpacity, Text, Linking, Image } from "react-native";
import { WebView as NativeWebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";

/**
 * Cross-platform WebView component that works on iOS, Android, and Web
 * On web, it renders an iframe instead of WebView
 * On mobile, it renders embedded content with YouTube fallback to native app
 */
const PlatformWebView = ({ source, style, ...props }) => {
    const uri = source?.uri;

    if (Platform.OS === "web") {
        // On web, use iframe instead of WebView
        if (!uri) {
            return <View style={style} />;
        }

        return (
            <iframe
                src={uri}
                style={{
                    ...StyleSheet.flatten(style),
                    border: "none",
                    width: "100%",
                    height: "100%",
                }}
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title="embedded-content"
            />
        );
    }

    // On iOS and Android
    if (!uri) {
        return <View style={style} />;
    }

    // Check if it's a YouTube URL - use native app fallback to avoid error 153
    const isYouTube = uri.includes('youtube');
    if (isYouTube) {
        const openYouTubeVideo = async () => {
            // Extract video ID from embed URL
            const videoIdMatch = uri.match(/embed\/([a-zA-Z0-9_-]+)/);
            if (videoIdMatch && videoIdMatch[1]) {
                const videoId = videoIdMatch[1];
                const youtubeUrls = [
                    `youtube://www.youtube.com/watch?v=${videoId}`, // Android YouTube app
                    `youtu://www.youtube.com/watch?v=${videoId}`, // iOS YouTube app alternate
                    `https://www.youtube.com/watch?v=${videoId}`, // Fallback to browser
                ];
                
                for (const url of youtubeUrls) {
                    try {
                        const canOpen = await Linking.canOpenURL(url);
                        if (canOpen) {
                            await Linking.openURL(url);
                            return;
                        }
                    } catch (error) {
                        continue;
                    }
                }
                
                // Final fallback
                try {
                    await Linking.openURL(`https://www.youtube.com/watch?v=${videoId}`);
                } catch (error) {
                    console.error('Error opening YouTube video:', error);
                }
            }
        };

        // Show YouTube player with thumbnail
        const videoIdMatch = uri.match(/embed\/([a-zA-Z0-9_-]+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

        return (
            <TouchableOpacity 
                style={[style, styles.container]}
                onPress={openYouTubeVideo}
                activeOpacity={0.9}
            >
                {thumbnailUrl && (
                    <Image
                        source={{ uri: thumbnailUrl }}
                        style={styles.thumbnail}
                        resizeMode="cover"
                    />
                )}
                <View style={styles.overlay}>
                    <View style={styles.playButtonContainer}>
                        <View style={styles.playButton}>
                            <View style={styles.playIcon} />
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    // For non-YouTube content, use native WebView with HTML injection
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    background-color: #000;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .container {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                }
                iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <iframe
                    src="${uri}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                    title="Embedded content"
                ></iframe>
            </div>
        </body>
        </html>
    `;

    // For iOS and Android, use native WebView with HTML source
    const mobileProps = {
        ...props,
        javaScriptEnabled: true,
        domStorageEnabled: true,
        mediaPlaybackRequiresUserAction: false,
        allowsInlineMediaPlayback: true,
        useWebKit: true,
        originWhitelist: ['*'],
        mixedContentMode: 'always',
        scrollEnabled: false,
        bounces: false,
    };

    return (
        <NativeWebView 
            source={{ html: htmlContent }}
            style={style} 
            {...mobileProps} 
        />
    );
};

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
        position: 'relative',
    },
    thumbnail: {
        ...StyleSheet.absoluteFillObject,
        width: '100%',
        height: '100%',
    },
    overlay: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        ...StyleSheet.absoluteFillObject,
    },
    playButtonContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    playButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playIcon: {
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderLeftColor: 'rgba(230, 33, 23, 1)',
        borderLeftWidth: 18,
        borderRightWidth: 0,
        borderTopColor: 'transparent',
        borderTopWidth: 11,
        borderBottomColor: 'transparent',
        borderBottomWidth: 11,
        marginLeft: 5,
    },
});

export default PlatformWebView;
