import { useEffect, useState } from 'react';

/**
 * Hook to compute scrollbar width
 * Used to compensate for scrollbar impact on padding
 */
export const useScrollbarWidth = (): number => {
	const [scrollbarWidth, setScrollbarWidth] = useState(0);

	useEffect(() => {
		const measure = (): number => {
			const outer = document.createElement('div');
			outer.style.cssText = 'visibility:hidden;overflow:scroll;width:100px;height:100px;position:absolute;top:-9999px;';
			// @ts-ignore - msOverflowStyle is IE-specific
			outer.style.msOverflowStyle = 'scrollbar';
			document.body.appendChild(outer);

			const inner = document.createElement('div');
			inner.style.width = '100%';
			inner.style.height = '1px';
			outer.appendChild(inner);

			const width = outer.offsetWidth - outer.clientWidth;
			document.body.removeChild(outer);
			return width;
		};

		const width = measure();

		setScrollbarWidth(width);

		const handleResize = () => {
			const newWidth = measure();
			setScrollbarWidth((prev) => (newWidth !== prev ? newWidth : prev));
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	}, []);

	return scrollbarWidth;
};
