-- Map existing health status values to new schema
-- 'degraded' -> 'warning'
-- 'unhealthy' -> 'critical'
-- 'healthy' remains 'healthy'

UPDATE `system_metrics` 
SET `overall_health` = 'warning' 
WHERE `overall_health` = 'degraded';

UPDATE `system_metrics` 
SET `overall_health` = 'critical' 
WHERE `overall_health` = 'unhealthy';