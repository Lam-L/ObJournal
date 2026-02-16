/**
 * 插件常量配置
 */

// 分页配置
export const PAGINATION = {
	ITEMS_PER_PAGE: 20,
	BATCH_SIZE: 10,
} as const;

// 内容处理配置
export const CONTENT = {
	MAX_PREVIEW_LENGTH: 200,
	MAX_CONTENT_READ_LENGTH: 2000, // 元数据优先加载时读取的前N个字符
	MAX_IMAGES_PER_CARD: 5,
} as const;

// 图片懒加载配置
export const IMAGE_LOADING = {
	ROOT_MARGIN: '50px',
	LAZY_LOADING: true,
} as const;

// UI 延迟配置
export const UI_DELAYS = {
	FILE_OPEN_DELAY: 100, // 文件打开延迟（ms）
	RENDER_DELAY: 50, // 渲染延迟（ms）
	SCAN_DELAY: 100, // 扫描延迟（ms）
} as const;

// 日志配置
export const LOGGING = {
	ENABLED: true, // 调试时设为 true
	PREFIX: '[JournalView]',
} as const;

// 文件过滤配置
export const FILE_FILTER = {
	EXCLUDED_PREFIXES: ['.'],
	EXCLUDED_NAMES: ['手记视图'],
} as const;

// 日期字段配置
export const DATE_FIELDS = ['date', 'Date', 'created', 'created_time'] as const;
