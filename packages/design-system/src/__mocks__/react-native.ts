const Platform = {
  OS: 'web' as const,
  select: <T extends Record<string, unknown>>(obj: T): T[keyof T] | undefined => {
    return (obj.web as T[keyof T]) ?? (obj.default as T[keyof T]);
  },
};

const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: <T>(style: T | T[]): T => (Array.isArray(style) ? style[0]! : style),
};

const Text = 'Text';
const View = 'View';
const Image = 'Image';
const TouchableOpacity = 'TouchableOpacity';
const ScrollView = 'ScrollView';
const ActivityIndicator = 'ActivityIndicator';

export { Platform, StyleSheet, Text, View, Image, TouchableOpacity, ScrollView, ActivityIndicator };
