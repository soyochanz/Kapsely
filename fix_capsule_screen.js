const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\Ochanz\\Desktop\\kaps\\src\\screens\\CapsuleCreationScreen.tsx';

let content = fs.readFileSync(filePath, 'utf-8');

const anchorStart = 'style={[styles.safeArea, keyboardVisible && { borderBottomWidth: 0 }, { paddingTop: insets.top + 10 }]}\\r\\n                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}\\r\\n            >';
const anchorEnd = '<View style={styles.heroTextOverlay}>';

const startIndex = content.indexOf('style={[styles.safeArea, keyboardVisible && { borderBottomWidth: 0 }, { paddingTop: insets.top + 10 }]}\r\n                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}\r\n            >');
const endIndex = content.indexOf('<View style={styles.heroTextOverlay}>');

if (startIndex === -1 || endIndex === -1) {
    console.error('Could not find anchor points:', { startIndex, endIndex });
    process.exit(1);
}

const before = content.substring(0, startIndex + 'style={[styles.safeArea, keyboardVisible && { borderBottomWidth: 0 }, { paddingTop: insets.top + 10 }]}\r\n                onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}\r\n            >'.length);
const after = content.substring(endIndex);

const insertedContent = `
                {/* Header */}
                <View style={[styles.header, keyboardVisible && { paddingTop: 0, paddingBottom: 5 }, { paddingTop: 10 }]}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => navigation.goBack()} style={styles.headerBtn}>
                        <Ionicons name="close" size={24} color={Colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{t('create.title')}</Text>
                    <View style={styles.headerBtn} />
                </View>

                {/* Step Progress Bar */}
                <View style={styles.stepProgressWrap}>
                    <View style={styles.stepProgressTrack}>
                        <LinearGradient
                            colors={[Colors.primary, Colors.primaryDark]}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                            style={[styles.stepProgressFill, { width: \`\${((stepIndex + 1) / STEPS.length) * 100}%\` as any }]}
                        />
                    </View>
                    <View style={styles.stepProgressLabels}>
                        {STEPS.map((s, i) => (
                            <Text
                                key={s}
                                style={[styles.stepProgressLabel, { color: stepIndex >= i ? Colors.primary : Colors.textMuted }]}
                            >
                                {t(\`create.\${s}\`)}
                            </Text>
                        ))}
                    </View>
                </View>
            </View>

            {/* Persistent Hero Preview - Hidden in Review step */}
            {currentStep !== 'review' && headerHeight > 0 && (
                <Animated.View 
                    collapsable={false}
                    style={{ 
                        height: 320, 
                        paddingHorizontal: Spacing.md,
                        position: 'absolute',
                        top: headerHeight,
                        left: 0, right: 0,
                        zIndex: 5,
                        opacity: heroOpacity,
                        transform: [{
                            translateY: scrollY.interpolate({
                                inputRange: [0, 200],
                                outputRange: [0, -220],
                                extrapolate: 'clamp'
                            })
                        }]
                    }}
                >
                    <Animated.View style={[styles.heroCardContainer]}>
                        {/* Capsule — tappable to change model */}
                        <View style={styles.heroImageWrapper}>
                            <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => setShowModelModal(true)}
                                style={{ alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Animated.View style={{ transform: [{ scale: capScaleAnim }], opacity: currentStep === 'identity' ? blinkAnim : 1, alignItems: 'center' }}>
                                    <CapsuleWithTimer
                                        modelKey={selectedModel}
                                        source={activeModel.image ? { uri: activeModel.image } : (MODEL_IMAGES as any)[selectedModel] || (MODEL_IMAGES as any).basicred_kap}
                                        date={openingDate}
                                        chainId={selectedChainId}
                                        style={styles.heroModel}
                                        darkerShadow={true}
                                        hideTimer={true}
                                    />
                                </Animated.View>
                            </TouchableOpacity>

                            {/* Discrete chip below capsule */}
                            <TouchableOpacity
                                style={styles.changeDesignChip}
                                activeOpacity={0.8}
                                onPress={() => setShowModelModal(true)}
                            >
                                <Ionicons name="color-palette-outline" size={14} color={Colors.textSecondary} />
                                <Text style={styles.changeDesignChipText}>{t('common.change')}</Text>
                            </TouchableOpacity>

                            {currentStep === 'identity' && (
                                <View style={{ position: 'absolute', right: -95, top: '40%', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <Ionicons name="arrow-back-circle" size={24} color={activeThemeColor} />
                                    <View style={{ backgroundColor: Colors.surface, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: activeThemeColor + '40', ...Shadow.subtle }}>
                                        <Text style={{ fontSize: 10, fontFamily: Fonts.bold, color: activeThemeColor }}>Change Design</Text>
                                    </View>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </Animated.View>
`;

const newContent = before + insertedContent + after;
fs.writeFileSync(filePath, newContent, 'utf-8');
console.log('Successfully replaced layout from', startIndex, 'to', endIndex);
