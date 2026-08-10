import { ChevronLeft, ChevronRight } from 'lucide-react';

// Page-at-a-time pager for admin/lead list views backed by server-side
// LIMIT/OFFSET (Leave Requests, Swap Requests, Team Availability) — keeps a
// large organization's full dataset from ever being pulled into the browser
// at once. Renders nothing when everything already fits on one page.
const Pagination = ({ page, pageSize, total, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="pagination">
      <span className="pagination-info">Showing {start}–{end} of {total}</span>
      <div className="week-nav">
        <button
          className="btn btn-secondary icon-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0}
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="pagination-info">Page {page + 1} of {totalPages}</span>
        <button
          className="btn btn-secondary icon-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= totalPages}
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
