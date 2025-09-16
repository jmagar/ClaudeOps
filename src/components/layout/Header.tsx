'use client';

import { Menu, Bell, User, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Breadcrumbs } from './Breadcrumbs';
import { ConnectionStatus } from './ConnectionStatus';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onSidebarToggle: () => void;
  sidebarExpanded: boolean;
  className?: string;
}

export function Header({ onSidebarToggle, sidebarExpanded, className }: HeaderProps) {
  const isMobile = useIsMobile();

  return (
    <header className={cn(
      'sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
      className
    )}>
      <div className="flex h-14 items-center justify-between px-4 lg:px-6">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Button */}
          {isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSidebarToggle}
              className="md:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}

          {/* Breadcrumbs */}
          <div className="hidden sm:block">
            <Breadcrumbs maxItems={4} />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Connection Status - Only on larger screens */}
          <div className="hidden lg:block">
            <ConnectionStatus variant="full" />
          </div>

          <Separator orientation="vertical" className="h-6 hidden lg:block" />

          {/* Theme Toggle */}
          <ThemeToggle variant="button" />

          {/* Notifications */}
          <Button
            variant="ghost"
            size="sm"
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {/* Notification badge */}
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-destructive animate-pulse" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          {/* User Menu */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 px-2"
            aria-label="User menu"
          >
            <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <User className="h-3 w-3" />
            </div>
            <span className="hidden sm:inline text-sm font-medium">
              Admin
            </span>
            <ChevronsUpDown className="h-3 w-3 opacity-60 hidden sm:inline" />
          </Button>
        </div>
      </div>

      {/* Mobile Breadcrumbs */}
      {isMobile && (
        <div className="border-t border-border/40 px-4 py-2 bg-muted/30 sm:hidden">
          <Breadcrumbs maxItems={2} />
        </div>
      )}
    </header>
  );
}