'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface BreadcrumbsProps {
  className?: string;
  maxItems?: number;
  homeIcon?: boolean;
  customItems?: BreadcrumbItem[];
}

// Route mapping for better breadcrumb labels
const routeMap: Record<string, string> = {
  '': 'Dashboard',
  'dashboard': 'Dashboard',
  'agents': 'Agents',
  'executions': 'Executions',
  'history': 'History',
  'settings': 'Settings',
  'docs': 'Documentation',
  'create': 'Create',
  'edit': 'Edit',
};

// Special route patterns that need dynamic handling
const dynamicRoutes: Record<string, (segment: string) => string> = {
  executions: (id: string) => `Execution ${id.slice(0, 8)}...`,
  agents: (id: string) => `Agent ${id}`,
};

function generateBreadcrumbItems(pathname: string): BreadcrumbItem[] {
  // Remove leading slash and split by '/'
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);
  
  if (segments.length === 0) {
    return [{ label: 'Dashboard', href: '/dashboard' }];
  }

  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: Home }
  ];

  let currentPath = '';

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const isLast = index === segments.length - 1;

    // Check if this is a dynamic route (like UUID)
    if (index > 0 && segments[index - 1] in dynamicRoutes) {
      const parentSegment = segments[index - 1];
      const label = dynamicRoutes[parentSegment](segment);
      
      items.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    } else {
      // Use route mapping or capitalize the segment
      const label = routeMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
      
      items.push({
        label,
        href: isLast ? undefined : currentPath,
      });
    }
  });

  return items;
}

export function Breadcrumbs({ 
  className, 
  maxItems = 4, 
  homeIcon = true,
  customItems 
}: BreadcrumbsProps) {
  const pathname = usePathname();

  // Use custom items if provided, otherwise generate from pathname
  const items = customItems || generateBreadcrumbItems(pathname);

  // Don't show breadcrumbs if only one item (home)
  if (items.length <= 1) {
    return null;
  }

  // Handle ellipsis for long breadcrumb trails
  const shouldCollapse = items.length > maxItems;
  const visibleItems = shouldCollapse 
    ? [items[0], ...items.slice(-2)] // Show first and last 2 items
    : items;

  const hasEllipsis = shouldCollapse && items.length > maxItems;

  return (
    <Breadcrumb className={cn('', className)}>
      <BreadcrumbList>
        {visibleItems.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === visibleItems.length - 1;
          const showEllipsis = hasEllipsis && index === 1;

          return (
            <Fragment key={`${item.href || item.label}-${index}`}>
              {/* Show ellipsis after first item if needed */}
              {showEllipsis && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbEllipsis />
                  <BreadcrumbSeparator />
                </>
              )}

              <BreadcrumbItem>
                {item.href ? (
                  <BreadcrumbLink asChild>
                    <Link 
                      href={item.href}
                      className="flex items-center gap-1.5"
                    >
                      {isFirst && homeIcon && item.icon && (
                        <item.icon className="h-3.5 w-3.5" />
                      )}
                      <span>{item.label}</span>
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="flex items-center gap-1.5">
                    {isFirst && homeIcon && item.icon && (
                      <item.icon className="h-3.5 w-3.5" />
                    )}
                    <span>{item.label}</span>
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>

              {/* Don't add separator after last item */}
              {!isLast && !showEllipsis && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}