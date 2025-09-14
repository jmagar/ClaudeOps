'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Bot,
  Play,
  History,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { NavigationItem } from './NavigationItem';
import { ConnectionStatus } from './ConnectionStatus';

interface SidebarProps {
  expanded: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
  className?: string;
}

const navigation = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: Bot,
    badge: 3, // Example badge count
  },
  {
    href: '/executions',
    label: 'Executions',
    icon: Play,
    badge: 12, // Example badge count
  },
  {
    href: '/history',
    label: 'History',
    icon: History,
  },
];

const bottomNavigation = [
  {
    href: '/docs',
    label: 'Documentation',
    icon: FileText,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
  },
];

interface SidebarContentProps {
  expanded: boolean;
  onItemClick?: () => void;
}

function SidebarContent({ expanded, onItemClick }: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo/Brand */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-4',
        expanded ? 'justify-start' : 'justify-center'
      )}>
        <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Bot className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        {expanded && (
          <div className="flex flex-col">
            <span className="font-bold text-sidebar-foreground">ClaudeOps</span>
            <span className="text-xs text-sidebar-foreground/60">AI Automation</span>
          </div>
        )}
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Main Navigation */}
      <nav className="flex-1 space-y-1 p-3">
        <div className="space-y-1">
          {navigation.map((item) => (
            <NavigationItem
              key={item.href}
              {...item}
              expanded={expanded}
              onClick={onItemClick}
            />
          ))}
        </div>

        <Separator className="my-4 bg-sidebar-border" />

        {/* Connection Status */}
        <div className={cn(
          'flex items-center',
          expanded ? 'gap-2' : 'justify-center'
        )}>
          <ConnectionStatus 
            variant={expanded ? 'full' : 'icon'} 
            showLabel={expanded}
            className="text-xs"
          />
        </div>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom Navigation */}
      <nav className="p-3 space-y-1">
        {bottomNavigation.map((item) => (
          <NavigationItem
            key={item.href}
            {...item}
            expanded={expanded}
            onClick={onItemClick}
          />
        ))}
      </nav>
    </div>
  );
}

export function Sidebar({ expanded, mobileOpen, onToggle, onMobileClose, className }: SidebarProps) {
  const isMobile = useIsMobile();

  // Mobile sidebar using Sheet
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose()}>
        <SheetContent side="left" className="p-0 bg-sidebar border-sidebar-border w-80">
          <SheetHeader className="p-4 border-b border-sidebar-border">
            <SheetTitle className="text-sidebar-foreground">Navigation</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100vh-80px)]">
            <SidebarContent expanded={true} onItemClick={onMobileClose} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop sidebar
  return (
    <aside
      className={cn(
        'relative bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col',
        expanded ? 'w-64' : 'w-16',
        className
      )}
    >
      {/* Collapse/Expand Button */}
      <Button
        variant="ghost"
        size="sm"
        className="absolute -right-3 top-6 z-10 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar shadow-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={onToggle}
      >
        {expanded ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="sr-only">
          {expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        </span>
      </Button>

      <SidebarContent expanded={expanded} />
    </aside>
  );
}