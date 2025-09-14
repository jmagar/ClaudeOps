'use client';

import { ReactNode, useState, useEffect } from 'react';
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
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Auto-collapse sidebar on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarExpanded(false);
    }
  }, [isMobile]);

  const handleSidebarToggle = () => {
    if (isMobile) {
      setMobileSidebarOpen(!mobileSidebarOpen);
    } else {
      setSidebarExpanded(!sidebarExpanded);
    }
  };

  const handleMobileSidebarClose = () => {
    if (isMobile) {
      setMobileSidebarOpen(false);
    }
  };

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