import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, ViewProps } from 'react-native';
import { useAIScreenshot } from '../hooks/useAIScreenshot';
import { ScreenshotOptions } from '../types';

interface ScreenshotViewProps extends ViewProps {
  children: React.ReactNode;
  onScreenshot?: (screenshot: string) => void;
  onError?: (error: Error) => void;
  screenshotOptions?: ScreenshotOptions;
}

export interface ScreenshotViewRef {
  takeScreenshot: (options?: ScreenshotOptions) => Promise<string>;
}

export const ScreenshotView = forwardRef<ScreenshotViewRef, ScreenshotViewProps>(
  ({ children, onScreenshot, onError, screenshotOptions, ...viewProps }, ref) => {
    const viewRef = useRef<View>(null);
    const { takeScreenshot: takeFullScreenshot } = useAIScreenshot();

    const takeScreenshot = useCallback(async (options?: ScreenshotOptions): Promise<string> => {
      try {
        // For now, take full screen screenshot
        // In a future version, we could implement component-specific screenshots
        const screenshot = await takeFullScreenshot(options || screenshotOptions);
        
        if (onScreenshot) {
          onScreenshot(screenshot);
        }
        
        return screenshot;
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Screenshot failed');
        
        if (onError) {
          onError(err);
        }
        
        throw err;
      }
    }, [takeFullScreenshot, screenshotOptions, onScreenshot, onError]);

    useImperativeHandle(ref, () => ({
      takeScreenshot,
    }), [takeScreenshot]);

    return (
      <View ref={viewRef} {...viewProps}>
        {children}
      </View>
    );
  }
);

ScreenshotView.displayName = 'ScreenshotView';