import { Icon } from './Icon';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: PaginationProps): React.JSX.Element {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const canPrev = page > 1 && totalPages > 1;
  const canNext = page < totalPages;

  const pages: (number | '…')[] = [];
  if (totalPages <= 5) {
    for (let p = 1; p <= totalPages; p++) pages.push(p);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) pages.push(p);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <div className="pagination">
      <span className="pagination__range">
        <strong>
          {from}–{to}
        </strong>{' '}
        of {total}
      </span>
      <button
        type="button"
        className="pagination__btn"
        aria-label="Previous page"
        disabled={!canPrev}
        onClick={() => onPageChange(page - 1)}
      >
        <Icon name="arrowLeft" size={14} />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="table__cell-muted" style={{ padding: '0 2px' }}>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`pagination__btn${p === page ? ' pagination__btn--active' : ''}`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="pagination__btn"
        aria-label="Next page"
        disabled={!canNext}
        onClick={() => onPageChange(page + 1)}
      >
        <Icon name="arrowRight" size={14} />
      </button>
    </div>
  );
}
