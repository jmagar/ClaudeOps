'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Theme = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  variant?: 'button' | 'select';
  className?: string;
}

export function ThemeToggle({ variant = 'button', className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  // Initialize theme from localStorage and system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
      setTheme(savedTheme);
    } else {
      setTheme('system');
    }
    setMounted(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const root = window.document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const effectiveTheme = theme === 'system' ? systemTheme : theme;

    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);

    localStorage.setItem('theme', theme);
  }, [theme, mounted]);

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.remove('light', 'dark');
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, mounted]);

  if (!mounted) {
    return (
      <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
    );
  }

  const getThemeIcon = (currentTheme: Theme) => {
    switch (currentTheme) {
      case 'light':
        return Sun;
      case 'dark':
        return Moon;
      case 'system':
        return Monitor;
      default:
        return Monitor;
    }
  };

  const getThemeLabel = (currentTheme: Theme) => {
    switch (currentTheme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'System';
    }
  };

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  if (variant === 'select') {
    return (
      <Select value={theme} onValueChange={(value: Theme) => setTheme(value)}>
        <SelectTrigger className={className}>
          <SelectValue>
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = getThemeIcon(theme);
                return <Icon className="h-4 w-4" />;
              })()}
              <span className="hidden sm:inline">{getThemeLabel(theme)}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="light">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4" />
              Light
            </div>
          </SelectItem>
          <SelectItem value="dark">
            <div className="flex items-center gap-2">
              <Moon className="h-4 w-4" />
              Dark
            </div>
          </SelectItem>
          <SelectItem value="system">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4" />
              System
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }

  // Button variant with tooltip
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleTheme}
            className={className}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'} theme`}
          >
            {(() => {
              const Icon = getThemeIcon(theme);
              return <Icon className="h-4 w-4" />;
            })()}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col items-center gap-1">
            <span className="font-medium">Current: {getThemeLabel(theme)}</span>
            <span className="text-xs text-muted-foreground">
              Click to cycle themes
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}