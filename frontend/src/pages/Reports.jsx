import { useState, useEffect } from 'react';
import { LuPrinter } from 'react-icons/lu';
import { api } from '../services/api';
import useAuth from '../hooks/useAuth';
import { toDateString } from '../utils/dateUtils';

const TABS = [
  { key: 'coverage', label: 'Shift Coverage' },
  { key: 'leave', label: 'Leave History' },
  { key: 'employees', label: 'Employee Stats' },
];

const ROLE_LABELS = {
  employee: 'Employee',
  shift_manager: 'Shift Manager',
};

const STATUS_BADGE = {
  pending: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
};

const ShiftCoverageTab = ({ data }) => {
  const totals = data.reduce(
    (acc, row) => ({
      shifts: acc.shifts + Number(row.total_shifts),
      fully: acc.fully + Number(row.fully_staffed),
      under: acc.under + Number(row.understaffed),
      hours: acc.hours + Number(row.total_hours),
    }),
    { shifts: 0, fully: 0, under: 0, hours: 0 }
  );

  const fullyPct = totals.shifts ? Math.round((totals.fully / totals.shifts) * 100) : 0;
  const underPct = totals.shifts ? Math.round((totals.under / totals.shifts) * 100) : 0;

  return (
    <>
      <div className="reports-summary">
        <div className="report-stat">
          <div className="report-stat-value">{totals.shifts}</div>
          <div className="report-stat-label">Total Published Shifts</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value" style={{ color: 'var(--success)' }}>
            {totals.fully} <small style={{ fontSize: '0.875rem' }}>({fullyPct}%)</small>
          </div>
          <div className="report-stat-label">Fully Staffed</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value" style={{ color: 'var(--warning)' }}>
            {totals.under} <small style={{ fontSize: '0.875rem' }}>({underPct}%)</small>
          </div>
          <div className="report-stat-label">Understaffed</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{totals.hours}h</div>
          <div className="report-stat-label">Total Hours Scheduled</div>
        </div>
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Week Starting</th>
              <th className="num">Total Shifts</th>
              <th className="num">Fully Staffed</th>
              <th className="num">Understaffed</th>
              <th className="num">Total Hours</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={5} className="empty-table">No published shifts in this period.</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  <td>{formatDate(row.week_start)}</td>
                  <td className="num">{row.total_shifts}</td>
                  <td className="num" style={{ color: Number(row.understaffed) === 0 ? 'var(--success)' : undefined }}>
                    {row.fully_staffed}
                  </td>
                  <td className="num" style={{ color: Number(row.understaffed) > 0 ? 'var(--warning)' : undefined }}>
                    {row.understaffed}
                  </td>
                  <td className="num">{row.total_hours}h</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const LeaveHistoryTab = ({ data, showDept }) => {
  const counts = data.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    {}
  );

  return (
    <>
      <div className="reports-summary">
        <div className="report-stat">
          <div className="report-stat-value">{data.length}</div>
          <div className="report-stat-label">Total Requests</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value" style={{ color: 'var(--warning)' }}>
            {counts.pending || 0}
          </div>
          <div className="report-stat-label">Pending</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value" style={{ color: 'var(--success)' }}>
            {counts.approved || 0}
          </div>
          <div className="report-stat-label">Approved</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value" style={{ color: 'var(--error)' }}>
            {counts.rejected || 0}
          </div>
          <div className="report-stat-label">Rejected</div>
        </div>
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Employee</th>
              {showDept && <th>Department</th>}
              <th>Period</th>
              <th className="num">Days</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Reviewed By</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={showDept ? 7 : 6} className="empty-table">No leave requests in this period.</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.user_name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>@{row.username}</div>
                  </td>
                  {showDept && <td>{row.department_name || '—'}</td>}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(row.start_date)}
                    {row.end_date !== row.start_date && <> – {formatDate(row.end_date)}</>}
                  </td>
                  <td className="num">{row.days}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.reason || '—'}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[row.status]}`}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>
                    {row.reviewed_by_name || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const EmployeeStatsTab = ({ data }) => {
  const totals = data.reduce(
    (acc, r) => ({
      hours: acc.hours + Number(r.total_hours),
      shifts: acc.shifts + Number(r.shifts_worked),
      swaps: acc.swaps + Number(r.swaps_requested) + Number(r.swaps_received),
    }),
    { hours: 0, shifts: 0, swaps: 0 }
  );

  const avgHours = data.length ? (totals.hours / data.length).toFixed(1) : '0.0';

  return (
    <>
      <div className="reports-summary">
        <div className="report-stat">
          <div className="report-stat-value">{data.length}</div>
          <div className="report-stat-label">Employees</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{avgHours}h</div>
          <div className="report-stat-label">Avg Hours / Employee</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{totals.shifts}</div>
          <div className="report-stat-label">Total Shifts Worked</div>
        </div>
        <div className="report-stat">
          <div className="report-stat-value">{totals.swaps}</div>
          <div className="report-stat-label">Total Swap Activity</div>
        </div>
      </div>

      <div className="reports-table-wrap">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th className="num">Shifts</th>
              <th className="num">Hours</th>
              <th className="num">Swaps Out</th>
              <th className="num">Swaps In</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr><td colSpan={6} className="empty-table">No employee data for this period.</td></tr>
            ) : (
              data.map((row, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>@{row.username}</div>
                  </td>
                  <td>
                    <span className={`badge ${row.role === 'shift_manager' ? 'badge-accepted' : 'badge-draft'}`}>
                      {ROLE_LABELS[row.role]}
                    </span>
                  </td>
                  <td className="num">{row.shifts_worked}</td>
                  <td className="num">{Number(row.total_hours).toFixed(1)}h</td>
                  <td className="num">{row.swaps_requested}</td>
                  <td className="num">{row.swaps_received}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const Reports = () => {
  const { isAdmin } = useAuth();

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return toDateString(d);
  });
  const [toDate, setToDate] = useState(() => toDateString(new Date()));
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [activeTab, setActiveTab] = useState('coverage');

  const [shiftData, setShiftData] = useState([]);
  const [leaveData, setLeaveData] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api.getDepartments()
      .then(d => setDepartments(d))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fromDate || !toDate) return;

    const params = { from: fromDate, to: toDate };
    if (isAdmin && selectedDept) params.department_id = selectedDept;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (activeTab === 'coverage') {
          setShiftData(await api.getShiftCoverage(params));
        } else if (activeTab === 'leave') {
          setLeaveData(await api.getReportsLeave(params));
        } else {
          setEmployeeData(await api.getEmployeeStats(params));
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fromDate, toDate, selectedDept]);

  const activeTabLabel = TABS.find(t => t.key === activeTab)?.label ?? '';
  const deptLabel = isAdmin
    ? (selectedDept ? departments.find(d => d.id === selectedDept)?.name ?? 'All Departments' : 'All Departments')
    : 'Your Department';
  const printDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Reports</h2>
            <p className="page-subtitle">Shift coverage, leave history and employee stats</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <LuPrinter size={16} />
            Print / Save PDF
          </button>
        </div>
      </div>

      <div className="print-header">
        <div className="print-header-logo">ShiftWise</div>
        <h1 className="print-header-title">{activeTabLabel} Report</h1>
        <p className="print-header-meta">
          {deptLabel}&nbsp;&nbsp;·&nbsp;&nbsp;{formatDate(fromDate)} – {formatDate(toDate)}
        </p>
        <p className="print-header-date">Generated {printDate}</p>
      </div>

      <div className="reports-controls">
        <label>
          From
          <input
            type="date"
            className="date-input"
            value={fromDate}
            max={toDate}
            onChange={e => setFromDate(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            className="date-input"
            value={toDate}
            min={fromDate}
            onChange={e => setToDate(e.target.value)}
          />
        </label>
        {isAdmin && (
          <select
            className="dept-select"
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="tabs">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="page-error">{error}</div>}

      {loading ? (
        <div className="page-loading">Loading report...</div>
      ) : (
        <>
          {activeTab === 'coverage' && <ShiftCoverageTab data={shiftData} />}
          {activeTab === 'leave' && <LeaveHistoryTab data={leaveData} showDept={isAdmin} />}
          {activeTab === 'employees' && <EmployeeStatsTab data={employeeData} />}
        </>
      )}
    </div>
  );
};

export default Reports;
