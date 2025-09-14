'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface NavigationItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  expanded?: boolean;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

export function NavigationItem({
  href,
  label,
  icon: Icon,
  badge,
  expanded = true,
  onClick,
  className,
  children,
}: NavigationItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(href + '/');

  const content = (
    <Link
      href={href as Route}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        isActive
          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
          : 'text-sidebar-foreground',
        expanded ? 'justify-start' : 'justify-center',
        className
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {expanded && (
        <>
          <span className="truncate">{label}</span>
          {badge && (
            <Badge 
              variant={isActive ? 'secondary' : 'outline'} 
              className="ml-auto h-5 text-xs"
            >
              {badge}
            </Badge>
          )}
        </>
      )}
      {!expanded && badge && (
        <Badge 
          variant={isActive ? 'secondary' : 'outline'}
          className="absolute -right-1 -top-1 h-4 min-w-4 text-xs p-0 flex items-center justify-center"
        >
          {typeof badge === 'number' && badge > 99 ? '99+' : badge}
        </Badge>
      )}
    </Link>
  );

  if (!expanded) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              {content}
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            <span>{label}</span>
            {badge && (
              <Badge variant="outline" className="h-5 text-xs">
                {badge}
              </Badge>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div>
      {content}
      {children}
    </div>
  );
}