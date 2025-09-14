'use client';

import { ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: ReactNode;
  className?: string;
}

export function AppLayout({ children, className }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebar-expanded');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const previousExpandedState = useRef<boolean>(true);

  // Preserve sidebar state across mobile transitions
  useEffect(() => {
    if (isMobile) {
      // Save current state before collapsing for mobile
      previousExpandedState.current = sidebarExpanded;
      setSidebarExpanded(false);
    } else {
      // Restore previous state when leaving mobile
      setSidebarExpanded(previousExpandedState.current);
    }
  }, [isMobile, sidebarExpanded]);

  // Persist sidebar state to localStorage
  useEffect(() => {
    if (!isMobile && typeof window !== 'undefined') {
      localStorage.setItem('sidebar-expanded', JSON.stringify(sidebarExpanded));
    }
  }, [sidebarExpanded, isMobile]);

  const handleSidebarToggle = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen(prev => !prev);
    } else {
      setSidebarExpanded((prev: boolean) => !prev);
    }
  }, [isMobile]);

  const handleMobileSidebarClose = useCallback(() => {
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  }, [isMobile]);

  return (
    <div className={cn('min-h-screen bg-background flex', className)}>
      {/* Sidebar */}
      <Sidebar
        expanded={sidebarExpanded}
        mobileOpen={mobileSidebarOpen}
        onToggle={handleSidebarToggle}
        onMobileClose={handleMobileSidebarClose}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <Header 
          onSidebarToggle={handleSidebarToggle}
          sidebarExpanded={sidebarExpanded}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="container mx-auto p-4 md:p-6 lg:p-8 max-w-none">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}