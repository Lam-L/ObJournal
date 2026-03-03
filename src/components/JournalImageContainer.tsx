import React, { useState, useEffect, useRef, memo } from 'react';
import { ImageInfo } from '../utils/utils';
import { useThumbnailUrl } from '../hooks/useThumbnailUrl';
import { useJournalView } from '../context/JournalViewContext';

interface JournalImageContainerProps {
	images: ImageInfo[];
	totalImages: number;
	allImages: ImageInfo[];
	/** When true in virtualized list, render img directly to avoid placeholder flicker */
	skipLazyLoad?: boolean;
}

interface ImageItemProps {
	image: ImageInfo;
	index: number;
	className?: string;
	showMoreCount?: number;
	skipLazyLoad?: boolean;
}

const ImageItem: React.FC<ImageItemProps> = ({ image, index, className, showMoreCount, skipLazyLoad }) => {
	const { app } = useJournalView();
	const displayUrl = useThumbnailUrl(image, app);
	const [isLoaded, setIsLoaded] = useState(skipLazyLoad);
	const [hasError, setHasError] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const imgRef = useRef<HTMLImageElement>(null);

	useEffect(() => {
		if (skipLazyLoad) return;
		if (!containerRef.current) return;

		const rect = containerRef.current.getBoundingClientRect();
		const isInViewport = rect.top < window.innerHeight + 100 && rect.bottom > -100;

		if (isInViewport) {
			setIsLoaded(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !isLoaded) {
						setIsLoaded(true);
						observer.unobserve(entry.target);
					}
				});
			},
			{ rootMargin: '100px' }
		);
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [isLoaded, skipLazyLoad]);

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		// TODO: Implement image viewer
		console.log('Open image viewer', image);
	};

	const handleImageError = () => {
		setHasError(true);
		setIsLoaded(true);
	};

	// Virtualized list: render img directly to avoid flicker from placeholder → img transition
	const shouldShowImg = skipLazyLoad || isLoaded;

	// On error: show minimal placeholder (reference notebook-navigator: avoid broken image)
	if (hasError) {
		return (
			<div className={`journal-image-container journal-image-container--error ${className || ''}`}>
				<div className="journal-image-placeholder" />
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`journal-image-container ${className || ''}`}
			onClick={handleClick}
		>
			{shouldShowImg ? (
				<img
					ref={imgRef}
					src={displayUrl}
					alt={image.altText || image.name}
					className="journal-image"
					loading="lazy"
					decoding="async"
					onLoad={() => setIsLoaded(true)}
					onError={handleImageError}
					draggable={false}
					onDragStart={(e) => e.preventDefault()}
				/>
			) : (
				<div className="journal-image-placeholder" />
			)}
			{showMoreCount !== undefined && showMoreCount > 0 && (
				<div className="journal-image-more">
					+{showMoreCount}
				</div>
			)}
		</div>
	);
};

export const JournalImageContainer: React.FC<JournalImageContainerProps> = memo(({
	images,
	totalImages,
	allImages,
	skipLazyLoad = false,
}) => {
	const imageCount = images.length;
	// 5+ images use 'multiple' class instead of 'five'
	const containerClass = `journal-images journal-images-${imageCount === 1 ? 'single' : imageCount === 2 ? 'double' : imageCount === 3 ? 'triple' : imageCount === 4 ? 'quad' : 'multiple'}`;
	const moreCount = totalImages > images.length ? totalImages - images.length : undefined;

	if (imageCount === 1) {
		return (
			<div className={containerClass}>
				<ImageItem image={images[0]} index={0} showMoreCount={moreCount} skipLazyLoad={skipLazyLoad} />
			</div>
		);
	}

	if (imageCount === 2) {
		return (
			<div className={containerClass}>
				<ImageItem image={images[0]} index={0} skipLazyLoad={skipLazyLoad} />
				<ImageItem image={images[1]} index={1} showMoreCount={moreCount} skipLazyLoad={skipLazyLoad} />
			</div>
		);
	}

	if (imageCount === 3) {
		return (
			<div className={containerClass}>
				<ImageItem image={images[0]} index={0} className="journal-image-container-large" skipLazyLoad={skipLazyLoad} />
				<ImageItem image={images[1]} index={1} className="journal-image-container-small" skipLazyLoad={skipLazyLoad} />
				<ImageItem image={images[2]} index={2} className="journal-image-container-small" showMoreCount={moreCount} skipLazyLoad={skipLazyLoad} />
			</div>
		);
	}

	if (imageCount === 4) {
		return (
			<div className={containerClass}>
				<ImageItem image={images[0]} index={0} className="journal-image-container-quad-left" skipLazyLoad={skipLazyLoad} />
				<ImageItem image={images[1]} index={1} className="journal-image-container-quad-right-top" skipLazyLoad={skipLazyLoad} />
				<div className="journal-images-quad-right-bottom">
					<ImageItem image={images[2]} index={2} className="journal-image-container-quad-right-bottom-left" skipLazyLoad={skipLazyLoad} />
					<ImageItem image={images[3]} index={3} className="journal-image-container-quad-right-bottom-right" showMoreCount={moreCount} skipLazyLoad={skipLazyLoad} />
				</div>
			</div>
		);
	}

	return (
		<div className={containerClass}>
			<ImageItem image={images[0]} index={0} className="journal-image-container-large" skipLazyLoad={skipLazyLoad} />
			<div className="journal-images-multiple-right-grid">
				{images.slice(1, 5).map((image, index) => (
					<ImageItem
						key={index + 1}
						image={image}
						index={index + 1}
						className="journal-image-container-small"
						showMoreCount={index === 3 ? moreCount : undefined}
						skipLazyLoad={skipLazyLoad}
					/>
				))}
			</div>
		</div>
	);
}, (prevProps, nextProps) => {
	return (
		prevProps.images.length === nextProps.images.length &&
		prevProps.totalImages === nextProps.totalImages &&
		prevProps.skipLazyLoad === nextProps.skipLazyLoad &&
		prevProps.images.every((img, index) => {
			const next = nextProps.images[index];
			return next && img.path === next.path && img.mtime === next.mtime;
		})
	);
});
