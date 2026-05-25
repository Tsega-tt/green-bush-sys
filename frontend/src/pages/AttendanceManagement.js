import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  FiClock,
  FiCalendar,
  FiUser,
  FiBarChart2,
  FiDownload
} from 'react-icons/fi';
import toast from 'react-hot-toast';

const ATTENDANCE_PAGE_CACHE_KEY = 'attendance_management_v1';
const ATTENDANCE_PAGE_CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Attendance Management Page Component
 * Admin interface for managing employee attendance
 */
const AttendanceManagement = () => {
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState([]);
  const [weeklyReport, setWeeklyReport] = useState([]);
  const [todayAttendance, setTodayAttendance] = useState([]);

  // Fetch attendance data
  useEffect(() => {
    const loadCache = () => {
      try {
        const raw = localStorage.getItem(ATTENDANCE_PAGE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Number.isFinite(parsed.ts)) return null;
        if (Date.now() - parsed.ts > ATTENDANCE_PAGE_CACHE_TTL_MS) return null;
        return parsed.data || null;
      } catch {
        return null;
      }
    };

    const saveCache = (data) => {
      try {
        localStorage.setItem(ATTENDANCE_PAGE_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      } catch {
        // ignore cache write failures
      }
    };

    const getArray = (result, field) => {
      if (result?.status !== 'fulfilled') return null;
      const data = result.value?.data?.data?.[field] ?? result.value?.data?.[field];
      return Array.isArray(data) ? data : [];
    };

    const fetchAttendanceData = async () => {
      try {
        const cached = loadCache();
        if (cached) {
          setAttendanceData(Array.isArray(cached.attendanceData) ? cached.attendanceData : []);
          setWeeklyReport(Array.isArray(cached.weeklyReport) ? cached.weeklyReport : []);
          setTodayAttendance(Array.isArray(cached.todayAttendance) ? cached.todayAttendance : []);
          setLoading(false);
        } else {
          setLoading(true);
        }

        const [attendanceResult, weeklyResult, todayResult] = await Promise.allSettled([
          api.attendance.getAll(),
          api.attendance.getWeeklyReport(),
          api.attendance.getTodayAttendance()
        ]);

        const nextAttendanceData = getArray(attendanceResult, 'attendance');
        const nextWeeklyReport = getArray(weeklyResult, 'report');
        const nextTodayAttendance = getArray(todayResult, 'attendance');

        setAttendanceData(prev => Array.isArray(nextAttendanceData) ? nextAttendanceData : prev);
        setWeeklyReport(prev => Array.isArray(nextWeeklyReport) ? nextWeeklyReport : prev);
        setTodayAttendance(prev => Array.isArray(nextTodayAttendance) ? nextTodayAttendance : prev);

        if (
          Array.isArray(nextAttendanceData) ||
          Array.isArray(nextWeeklyReport) ||
          Array.isArray(nextTodayAttendance)
        ) {
          saveCache({
            attendanceData: Array.isArray(nextAttendanceData) ? nextAttendanceData : (cached?.attendanceData || []),
            weeklyReport: Array.isArray(nextWeeklyReport) ? nextWeeklyReport : (cached?.weeklyReport || []),
            todayAttendance: Array.isArray(nextTodayAttendance) ? nextTodayAttendance : (cached?.todayAttendance || [])
          });
        }
      } catch (error) {
        console.error('Error fetching attendance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendanceData();
  }, []);

  // Calculate stats
  const calculateStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = attendanceData.filter(record => 
      record.date === today
    );

    const activeEmployees = todayRecords.filter(record => 
      !record.clock_out_time
    ).length;

    const totalHoursToday = todayRecords.reduce((sum, record) => 
      sum + (record.hours_worked || 0), 0
    );

    const avgHours = todayRecords.length > 0 ? totalHoursToday / todayRecords.length : 0;

    return {
      todayPresent: todayRecords.length,
      activeEmployees,
      totalHoursToday: totalHoursToday.toFixed(1),
      avgHours: avgHours.toFixed(1)
    };
  };

  const stats = calculateStats();

  // Export attendance report functionality
  const handleExportReport = () => {
    try {
      // Create CSV content for attendance report
      const csvContent = generateAttendanceCSV();
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `attendance-report-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Attendance report exported successfully!');
    } catch (error) {
      console.error('Error exporting attendance report:', error);
      toast.error('Failed to export attendance report');
    }
  };

  // Generate CSV content for attendance report
  const generateAttendanceCSV = () => {
    // Today's attendance section
    const todayHeaders = ['Employee Name', 'Username', 'Role', 'Clock In', 'Clock Out', 'Hours Worked', 'Status', 'Date'];
    const todayRows = todayAttendance.map(record => [
      record.full_name || '',
      record.username || '',
      (record.role || '').replace('_', ' '),
      record.clock_in_time ? new Date(record.clock_in_time).toLocaleString() : '-',
      record.clock_out_time ? new Date(record.clock_out_time).toLocaleString() : '-',
      record.hours_worked ? `${parseFloat(record.hours_worked).toFixed(1)}h` : '-',
      !record.clock_out_time ? 'Active' : 'Completed',
      new Date().toLocaleDateString()
    ]);

    // Weekly report section
    const weeklyHeaders = ['Employee Name', 'Username', 'Role', 'Days Worked', 'Total Hours', 'Avg Hours/Day', 'Week Start'];
    const weeklyRows = weeklyReport.map(report => [
      report.full_name || '',
      report.username || '',
      (report.role || '').replace('_', ' '),
      report.days_worked || 0,
      `${parseFloat(report.total_hours || 0).toFixed(1)}h`,
      report.days_worked > 0 ? `${(parseFloat(report.total_hours || 0) / report.days_worked).toFixed(1)}h` : '0h',
      report.week_start ? new Date(report.week_start).toLocaleDateString() : '-'
    ]);

    // Summary stats
    const summaryRows = [
      ['Summary Statistics', '', '', '', '', '', ''],
      ['Present Today', stats.todayPresent, '', '', '', '', ''],
      ['Currently Active', stats.activeEmployees, '', '', '', '', ''],
      ['Total Hours Today', `${stats.totalHoursToday}h`, '', '', '', '', ''],
      ['Avg Hours per Employee', `${stats.avgHours}h`, '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ];

    // Combine all sections
    const allRows = [
      ['ATTENDANCE REPORT - ' + new Date().toLocaleDateString(), '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ...summaryRows,
      ["TODAY'S ATTENDANCE", '', '', '', '', '', ''],
      todayHeaders,
      ...todayRows,
      ['', '', '', '', '', '', ''],
      ['WEEKLY REPORT', '', '', '', '', '', ''],
      weeklyHeaders,
      ...weeklyRows
    ];

    // Convert to CSV format
    return allRows.map(row => row.map(field => `"${field}"`).join(',')).join('\n');
  };

  if (loading) {
    return <LoadingSpinner text="Loading attendance data..." />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Attendance Management</h1>
          <p className="text-gray-600 mt-1">
            Track and manage employee attendance
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={handleExportReport}
            className="btn-outline flex items-center space-x-2"
          >
            <FiDownload className="w-4 h-4" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Present Today</p>
              <p className="text-2xl font-bold text-blue-600">{stats.todayPresent}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500">
              <FiUser className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Currently Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.activeEmployees}</p>
            </div>
            <div className="p-3 rounded-full bg-green-500">
              <FiClock className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Hours Today</p>
              <p className="text-2xl font-bold text-orange-600">{stats.totalHoursToday}h</p>
            </div>
            <div className="p-3 rounded-full bg-orange-500">
              <FiBarChart2 className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Hours/Employee</p>
              <p className="text-2xl font-bold text-purple-600">{stats.avgHours}h</p>
            </div>
            <div className="p-3 rounded-full bg-purple-500">
              <FiCalendar className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Today's Attendance */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            Today's Attendance
          </h3>
          <span className="text-sm text-gray-500">
            {new Date().toLocaleDateString()}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">Employee</th>
                <th className="table-header text-left py-3 px-4">Role</th>
                <th className="table-header text-left py-3 px-4">Clock In</th>
                <th className="table-header text-left py-3 px-4">Clock Out</th>
                <th className="table-header text-left py-3 px-4">Hours</th>
                <th className="table-header text-left py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {todayAttendance.map((record) => (
                <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {record.full_name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{record.full_name}</p>
                        <p className="text-sm text-gray-600">@{record.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="badge capitalize">
                      {record.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell">
                    {record.clock_in_time ? 
                      new Date(record.clock_in_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'
                    }
                  </td>
                  <td className="table-cell">
                    {record.clock_out_time ? 
                      new Date(record.clock_out_time).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'
                    }
                  </td>
                  <td className="table-cell">
                    {record.hours_worked ? 
                      `${parseFloat(record.hours_worked).toFixed(1)}h` : '-'
                    }
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${
                      !record.clock_out_time ? 'badge-success' : 'badge-info'
                    }`}>
                      {!record.clock_out_time ? 'Active' : 'Completed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {todayAttendance.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No attendance records for today
          </div>
        )}
      </div>

      {/* Weekly Report */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900">
            Weekly Report
          </h3>
          <div className="flex items-center space-x-4">
            <select className="input-field text-sm">
              <option>This Week</option>
              <option>Last Week</option>
              <option>2 Weeks Ago</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header text-left py-3 px-4">Employee</th>
                <th className="table-header text-left py-3 px-4">Role</th>
                <th className="table-header text-left py-3 px-4">Days Worked</th>
                <th className="table-header text-left py-3 px-4">Total Hours</th>
                <th className="table-header text-left py-3 px-4">Avg Hours/Day</th>
                <th className="table-header text-left py-3 px-4">Week Start</th>
              </tr>
            </thead>
            <tbody>
              {weeklyReport.map((report) => (
                <tr key={`${report.user_id}-${report.week_start}`} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {report.full_name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{report.full_name}</p>
                        <p className="text-sm text-gray-600">@{report.username}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="badge capitalize">
                      {report.role?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell font-medium">
                    {report.days_worked || 0}
                  </td>
                  <td className="table-cell font-medium">
                    {parseFloat(report.total_hours || 0).toFixed(1)}h
                  </td>
                  <td className="table-cell">
                    {report.days_worked > 0 ? 
                      (parseFloat(report.total_hours || 0) / report.days_worked).toFixed(1) : 0
                    }h
                  </td>
                  <td className="table-cell text-gray-600">
                    {report.week_start ? 
                      new Date(report.week_start).toLocaleDateString() : '-'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {weeklyReport.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No weekly report data available
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceManagement;
