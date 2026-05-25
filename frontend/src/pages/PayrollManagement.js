import React, { useState, useEffect, useCallback } from 'react';
import { FiDollarSign, FiUsers, FiGift, FiCpu, FiPlus, FiEdit } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../services/api';

const PayrollManagement = () => {
  const [activeTab, setActiveTab] = useState('salaries');
  const [salaries, setSalaries] = useState([]);
  const [payrollRecords, setPayrollRecords] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'salaries') {
        console.log('Loading salaries...');
        const response = await api.payroll.getAllSalaries();
        console.log('Salaries response:', response);
        setSalaries(response.data?.data || []);
      } else if (activeTab === 'payroll') {
        console.log('Loading payroll records...');
        const response = await api.payroll.getAllPayrollRecords();
        console.log('Payroll records response:', response);
        setPayrollRecords(response.data?.data || []);
      } else if (activeTab === 'benefits') {
        console.log('Loading benefits...');
        const response = await api.payroll.getAllBenefits();
        console.log('Benefits response:', response);
        setBenefits(response.data?.data || []);
      }
    } catch (error) {
      console.error('Error loading payroll data:', error);
      console.error('Full error details:', error.response || error);
      
      // Check if it's a database table missing error
      const errorMessage = error.response?.data?.message || error.message;
      if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
        toast.error('HR database tables not found. Please run: npm run add-hr-management');
      } else {
        toast.error(`Failed to load ${activeTab} data: ${errorMessage}`);
      }
      
      // Set empty arrays to prevent UI errors
      if (activeTab === 'salaries') setSalaries([]);
      else if (activeTab === 'payroll') setPayrollRecords([]);
      else if (activeTab === 'benefits') setBenefits([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const SalariesTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Employee Salaries</h3>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <FiPlus size={16} />
          Add Salary
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {salaries.length > 0 ? salaries.map((salary) => (
              <tr key={salary.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <FiUsers className="mr-2" />
                    {salary.employee_name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">
                  {salary.role?.replace('_', ' ')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap capitalize">
                  {salary.payment_type}
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  ${parseFloat(salary.base_amount || 0).toFixed(2)}
                  {salary.payment_type === 'hourly' && '/hr'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {salary.effective_date ? new Date(salary.effective_date).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button className="text-blue-600 hover:text-blue-800">
                    <FiEdit size={16} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                  <FiDollarSign size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No salary records found.</p>
                  <p className="text-sm">Add employee salaries to see them here.</p>
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                    <p><strong>Note:</strong> If you're seeing errors, make sure to run the HR setup command:</p>
                    <code className="bg-blue-100 px-2 py-1 rounded mt-2 inline-block">npm run add-hr-management</code>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const PayrollTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Payroll Records</h3>
        <button className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <FiCpu size={16} />
          Process Payroll
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pay Period</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross Pay</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Pay</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {payrollRecords.length > 0 ? payrollRecords.map((record) => (
              <tr key={record.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <FiUsers className="mr-2" />
                    {record.employee_name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {record.pay_period_start ? new Date(record.pay_period_start).toLocaleDateString() : 'N/A'} - 
                  {record.pay_period_end ? new Date(record.pay_period_end).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {parseFloat(record.regular_hours || 0).toFixed(1)}
                  {record.overtime_hours > 0 && (
                    <span className="text-orange-600"> (+{parseFloat(record.overtime_hours).toFixed(1)} OT)</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-medium">
                  ${parseFloat(record.gross_pay || 0).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap font-medium text-green-600">
                  ${parseFloat(record.net_pay || 0).toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    record.status === 'paid' ? 'bg-green-100 text-green-800' :
                    record.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {record.status || 'draft'}
                  </span>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                  <FiCpu size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>No payroll records found.</p>
                  <p className="text-sm">Process payroll to see records here.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const BenefitsTab = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Employee Benefits</h3>
        <button className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2">
          <FiPlus size={16} />
          Add Benefit
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {benefits.length > 0 ? benefits.map((benefit) => (
          <div key={benefit.id} className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h4 className="font-medium">{benefit.benefit_name}</h4>
                <p className="text-sm text-gray-600">{benefit.employee_name}</p>
              </div>
              <FiGift className="text-purple-500" />
            </div>
            
            <div className="mb-4">
              <span className={`px-2 py-1 text-xs rounded-full ${
                benefit.benefit_type === 'health_insurance' ? 'bg-red-100 text-red-800' :
                benefit.benefit_type === 'paid_time_off' ? 'bg-blue-100 text-blue-800' :
                benefit.benefit_type === 'employee_discount' ? 'bg-green-100 text-green-800' :
                benefit.benefit_type === 'training_allowance' ? 'bg-yellow-100 text-yellow-800' :
                'bg-purple-100 text-purple-800'
              }`}>
                {benefit.benefit_type?.replace('_', ' ') || 'benefit'}
              </span>
            </div>
            
            {benefit.value && (
              <div className="text-lg font-bold text-green-600 mb-2">
                ${parseFloat(benefit.value).toFixed(2)}
              </div>
            )}
            
            <div className="text-sm text-gray-600">
              Active since {benefit.start_date ? new Date(benefit.start_date).toLocaleDateString() : 'N/A'}
            </div>
          </div>
        )) : (
          <div className="col-span-full text-center py-12 text-gray-500">
            <FiGift size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No employee benefits found.</p>
            <p className="text-sm">Add employee benefits to see them here.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payroll Management</h1>
        <p className="text-gray-600">Manage employee salaries, payroll, and benefits</p>
      </div>

      <div className="mb-6">
        <nav className="flex space-x-8">
          {[
            { id: 'salaries', label: 'Salaries', icon: FiDollarSign },
            { id: 'payroll', label: 'Payroll Records', icon: FiCpu },
            { id: 'benefits', label: 'Benefits', icon: FiGift }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon size={20} />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {activeTab === 'salaries' && <SalariesTab />}
          {activeTab === 'payroll' && <PayrollTab />}
          {activeTab === 'benefits' && <BenefitsTab />}
        </>
      )}
    </div>
  );
};

export default PayrollManagement;
