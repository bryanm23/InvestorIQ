import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Spline from '@splinetool/react-spline';
import "./MarketStatistics.css";

const API_URL = "http://100.71.100.5:8000/rentcast_sender.php";

const getUserFriendlyErrorMessage = (error) => {
  const errorMessage = error?.message || '';
  const errorString = String(errorMessage).toLowerCase();
  if (errorString.includes('404') && errorString.includes('no data found')) {
    return "We couldn't find any market data for this location.";
  }
  if (errorString.includes('api error') || errorString.includes('rentcast')) {
    return "There was a problem connecting to the market database.";
  }
  if (errorString.includes('timeout')) {
    return "The search took too long. Please try again.";
  }
  if (errorString.includes('connection') || errorString.includes('network')) {
    return "Network issue. Please check your connection.";
  }
  return "Something went wrong. Try again with different search parameters.";
};

const MarketStatistics = () => {
  const navigate = useNavigate();
  
  // Search form state
  const [zipCode, setZipCode] = useState("");
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // ROI calculator state
  const [roiInputs, setRoiInputs] = useState({
    purchasePrice: 0,
    downPayment: 20, // percentage
    interestRate: 4.5,
    loanTerm: 30,
    propertyTax: 1.2, // percentage of property value per year
    insurance: 0.5, // percentage of property value per year
    maintenance: 1, // percentage of property value per year
    vacancy: 5, // percentage of rental income
    managementFee: 10, // percentage of rental income
  });
  
  const [roiResults, setRoiResults] = useState({
    monthlyRentalIncome: 0,
    monthlyCashFlow: 0,
    annualCashFlow: 0,
    cashOnCashReturn: 0,
    capRate: 0,
  });

  // Handle ROI calculator input changes
  const handleRoiInputChange = (e) => {
    const { name, value } = e.target;
    // Allow empty string for better UX, but convert to 0 for calculations
    const parsedValue = value === '' ? '' : parseFloat(value);
    const newInputs = { ...roiInputs, [name]: parsedValue };
    setRoiInputs(newInputs);
    
    if (marketData) {
      // For calculation, ensure empty strings are converted to 0
      const calculationInputs = { ...newInputs };
      Object.keys(calculationInputs).forEach(key => {
        if (calculationInputs[key] === '') {
          calculationInputs[key] = 0;
        }
      });
      calculateROI(marketData, calculationInputs);
    }
  };

  // Fetch market data based on zipcode
  const fetchMarketData = async () => {
    if (!zipCode || zipCode.length !== 5) {
      setError("Please enter a valid 5-digit zipcode");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Make API call to Rentcast through the PHP sender
      const response = await axios.post(API_URL, {
        action: "rentcast_getMarketData",
        params: {
          zipCode: zipCode,
          dataType: "All",
          historyRange: "12"
        }
      });
      
      if (response.data.status !== 'success') {
        throw new Error(`API request failed: ${response.data.message || 'Unknown error'}`);
      }
      
      const data = response.data.data;
      
      if (!data) {
        throw new Error("No market data available for this zipcode");
      }
      
      setMarketData(data);
      
      // Set initial purchase price based on median sale price
      if (data.data && data.data.medianPrice) {
        setRoiInputs(prev => ({
          ...roiInputs,
          purchasePrice: data.data.medianPrice || roiInputs.purchasePrice
        }));
      }      
      
      // Calculate ROI with the new data
      calculateROI(data, {
        ...roiInputs,
        purchasePrice: data.saleData?.medianPrice || roiInputs.purchasePrice
      });
    } catch (err) {
      setError(getUserFriendlyErrorMessage(err));
      console.error("Error fetching market data:", err);
    } finally {
      setLoading(false);
    }
  };
  // Calculate ROI based on market data and user inputs
  const calculateROI = (data, inputs) => {
    if (!data || !data.rentalData) return;

    // Validate inputs to ensure they're all valid numbers
    const validatedInputs = {
      purchasePrice: Math.max(0, Number(inputs.purchasePrice) || 0),
      downPayment: Math.min(100, Math.max(0, Number(inputs.downPayment) || 0)),
      interestRate: Math.max(0, Number(inputs.interestRate) || 0),
      loanTerm: Math.max(1, Number(inputs.loanTerm) || 30),
      propertyTax: Math.max(0, Number(inputs.propertyTax) || 0),
      insurance: Math.max(0, Number(inputs.insurance) || 0),
      maintenance: Math.max(0, Number(inputs.maintenance) || 0),
      vacancy: Math.min(100, Math.max(0, Number(inputs.vacancy) || 0)),
      managementFee: Math.min(100, Math.max(0, Number(inputs.managementFee) || 0))
    };
    
    const { 
      purchasePrice, downPayment, interestRate, loanTerm, 
      propertyTax, insurance, maintenance, vacancy, managementFee 
    } = validatedInputs;
    
    // Get median rent from data with fallback
    const monthlyRentalIncome = data.rentalData && typeof data.rentalData.medianRent === 'number' 
      ? data.rentalData.medianRent 
      : 0;
    
    // Calculate loan amount and monthly payment
    const loanAmount = purchasePrice * (1 - downPayment / 100);
    const monthlyInterestRate = interestRate / 100 / 12;
    const numberOfPayments = loanTerm * 12;
    
    // Calculate mortgage payment with safeguards against invalid math
    let monthlyMortgagePayment = 0;
    if (loanAmount > 0 && monthlyInterestRate > 0) {
      const compoundFactor = Math.pow(1 + monthlyInterestRate, numberOfPayments);
      if (compoundFactor > 1) { // Prevent division by zero
        monthlyMortgagePayment = loanAmount * 
          (monthlyInterestRate * compoundFactor) / 
          (compoundFactor - 1);
      }
    }
    
    // Calculate monthly expenses with safeguards
    const monthlyPropertyTax = purchasePrice > 0 ? (purchasePrice * (propertyTax / 100)) / 12 : 0;
    const monthlyInsurance = purchasePrice > 0 ? (purchasePrice * (insurance / 100)) / 12 : 0;
    const monthlyMaintenance = purchasePrice > 0 ? (purchasePrice * (maintenance / 100)) / 12 : 0;
    const monthlyVacancy = monthlyRentalIncome > 0 ? monthlyRentalIncome * (vacancy / 100) : 0;
    const monthlyManagementFee = monthlyRentalIncome > 0 ? monthlyRentalIncome * (managementFee / 100) : 0;
    
    const totalMonthlyExpenses = monthlyMortgagePayment + monthlyPropertyTax + 
      monthlyInsurance + monthlyMaintenance + monthlyVacancy + monthlyManagementFee;
    
    // Calculate cash flow
    const monthlyCashFlow = monthlyRentalIncome - totalMonthlyExpenses;
    const annualCashFlow = monthlyCashFlow * 12;
    
    // Calculate ROI metrics with safeguards
    const initialInvestment = purchasePrice * (downPayment / 100);
    // Prevent division by zero for cash on cash return
    const cashOnCashReturn = initialInvestment > 0 ? (annualCashFlow / initialInvestment) * 100 : 0;
    
    // Calculate annual net operating income (NOI)
    const annualOperatingExpenses = (monthlyPropertyTax + monthlyInsurance + monthlyMaintenance + 
      monthlyVacancy + monthlyManagementFee) * 12;
    const annualNetOperatingIncome = (monthlyRentalIncome * 12) - annualOperatingExpenses;
    
    // Prevent division by zero for cap rate
    const capRate = purchasePrice > 0 ? (annualNetOperatingIncome / purchasePrice) * 100 : 0;
    
    // Store all calculation details for display in cards
    const calculationDetails = {
      // Property value metrics
      purchasePrice,
      downPaymentPercent: downPayment,
      downPaymentAmount: initialInvestment,
      loanAmount,
      
      // Loan details
      interestRate,
      loanTerm,
      monthlyInterestRate,
      numberOfPayments,
      monthlyMortgagePayment,
      
      // Monthly income
      monthlyRentalIncome,
      effectiveMonthlyIncome: monthlyRentalIncome - monthlyVacancy,
      
      // Monthly expenses
      monthlyPropertyTax,
      monthlyInsurance,
      monthlyMaintenance,
      monthlyVacancy,
      monthlyManagementFee,
      totalMonthlyExpenses,
      
      // Return metrics
      monthlyCashFlow,
      annualCashFlow,
      annualNetOperatingIncome,
      cashOnCashReturn,
      capRate
    };
    
    // Update state with results
    setRoiResults({
      monthlyRentalIncome,
      monthlyCashFlow,
      annualCashFlow,
      cashOnCashReturn,
      capRate,
      calculationDetails // Add calculation details to results
    });
  };

  // Format currency values
  const formatCurrency = (value) => {
    // Handle undefined, null, NaN, or invalid values
    if (value === undefined || value === null || isNaN(value)) {
      return '$0';
    }
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Format percentage values
  const formatPercentage = (value) => {
    // Handle undefined, null, NaN, or invalid values
    if (value === undefined || value === null || isNaN(value)) {
      return '0.00%';
    }
    
    return `${value.toFixed(2)}%`;
  };
// Determine investment rating based on ROI metrics
  const getInvestmentRating = () => {
    const { cashOnCashReturn, capRate } = roiResults;
    
    if (cashOnCashReturn >= 12 && capRate >= 8) {
      return "excellent";
    } else if (cashOnCashReturn >= 8 && capRate >= 5) {
      return "good";
    } else if (cashOnCashReturn >= 5 && capRate >= 3) {
      return "fair";
    } else {
      return "poor";
    }
  };
  
  // Generate investment analysis explanation
  const getInvestmentAnalysis = () => {
    const { monthlyRentalIncome, monthlyCashFlow, cashOnCashReturn, capRate } = roiResults;
    const { purchasePrice, downPayment, interestRate, propertyTax, maintenance, vacancy } = roiInputs;
    
    const rating = getInvestmentRating();
    let analysis = "";
    let recommendations = [];
    
    // Base analysis on rating
    if (rating === "excellent") {
      analysis = `This property presents an excellent investment opportunity with a strong cash-on-cash return of ${formatPercentage(cashOnCashReturn)} and a cap rate of ${formatPercentage(capRate)}. Both metrics significantly exceed industry benchmarks for profitable real estate investments.`;
    } else if (rating === "good") {
      analysis = `This property represents a good investment opportunity with a healthy cash-on-cash return of ${formatPercentage(cashOnCashReturn)} and a solid cap rate of ${formatPercentage(capRate)}. These metrics indicate a profitable investment that should provide steady returns.`;
    } else if (rating === "fair") {
      analysis = `This property offers a fair investment opportunity with a cash-on-cash return of ${formatPercentage(cashOnCashReturn)} and a cap rate of ${formatPercentage(capRate)}. While not exceptional, these metrics suggest the property could be profitable with proper management.`;
    } else {
      analysis = `This property presents challenges as an investment with a low cash-on-cash return of ${formatPercentage(cashOnCashReturn)} and a cap rate of ${formatPercentage(capRate)}. These metrics fall below typical benchmarks for profitable real estate investments.`;
    }
    
    // Add cash flow analysis
    if (monthlyCashFlow > 0) {
      analysis += ` The property generates a positive monthly cash flow of ${formatCurrency(monthlyCashFlow)}, indicating that rental income exceeds expenses.`;
    } else {
      analysis += ` The property currently shows a negative monthly cash flow of ${formatCurrency(monthlyCashFlow)}, meaning expenses exceed rental income.`;
      recommendations.push("Look for ways to increase rental income or reduce monthly expenses to achieve positive cash flow.");
    }
    
    // Add specific factor analysis
    if (downPayment < 20) {
      recommendations.push("Consider increasing your down payment to reduce monthly mortgage payments and improve cash flow.");
    }
    
    if (interestRate > 5) {
      recommendations.push("Explore options for refinancing at a lower interest rate to reduce monthly mortgage payments.");
    }
    
    if (propertyTax > 1.5) {
      recommendations.push("Research potential property tax exemptions or appeals that might be available in this area.");
    }
    
    if (maintenance > 1.5) {
      recommendations.push("Budget for preventative maintenance to potentially reduce long-term maintenance costs.");
    }
    
    if (vacancy > 7) {
      recommendations.push("Consider strategies to reduce vacancy rates, such as longer lease terms or improved tenant screening.");
    }
    
    // Market-specific analysis
    if (marketData && marketData.saleData && marketData.saleData.medianPrice && 
        marketData.rentalData && marketData.rentalData.medianRent) {
      const medianPriceToRent = marketData.saleData.medianPrice / (marketData.rentalData.medianRent * 12);
      
      if (medianPriceToRent > 20) {
        analysis += ` The price-to-rent ratio in this market is relatively high at ${medianPriceToRent.toFixed(1)}, which can make it challenging to generate strong cash flow.`;
      } else if (medianPriceToRent < 15) {
        analysis += ` The price-to-rent ratio in this market is favorable at ${medianPriceToRent.toFixed(1)}, which is conducive to generating positive cash flow.`;
      }
    }
    
    return { rating, analysis, recommendations };
  };

  const handleBack = () => {
    navigate("/dashboard");
  };

  return (
    <div className="market-container">
      <div className="market-header">
        <div className="header-left">
          <button onClick={handleBack} className="back-button">Back to Dashboard</button>
          <h1>Market Statistics</h1>
        </div>
        <div className="market-search-container">
          <input
            type="text"
            placeholder="Enter Zipcode"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            maxLength={5}
            className="market-search-input"
          />
          <button 
            onClick={fetchMarketData}
            className="market-search-button"
          >
            Search
          </button>
        </div>
      </div>
      <div className="market-content">
        <div className="market-spline">
          <Spline scene="https://prod.spline.design/NSVcsdfW1SF9VkBv/scene.splinecode" />
        </div>
        
        <div className="market-data-wrapper">
          
          {loading && <div className="loading">Loading market data...</div>}
          {error && <div className="error">{error}</div>}
          
          {marketData && (
            <div className="market-data-container" style={{ marginTop: '20px' }}>
              <h2>Market Statistics for {marketData.zipCode}</h2>
              
              <div className="market-stats-grid">
                <div className="stat-card">
                  <h3>Sale Data</h3>
                  <p>Median Price: {formatCurrency(marketData.saleData.medianPrice)}</p>
                  <p>Average Price: {formatCurrency(marketData.saleData.averagePrice)}</p>
                  <p>Price Range: {formatCurrency(marketData.saleData.minPrice)} - {formatCurrency(marketData.saleData.maxPrice)}</p>
                  <p>Median Price/sqft: {formatCurrency(marketData.saleData.medianPricePerSquareFoot)}</p>
                  <p>Median Days on Market: {marketData.saleData.medianDaysOnMarket}</p>
                </div>
                
                <div className="stat-card">
                  <h3>Rental Data</h3>
                  <p>Median Rent: {formatCurrency(marketData.rentalData.medianRent)}</p>
                  <p>Average Rent: {formatCurrency(marketData.rentalData.averageRent)}</p>
                  <p>Rent Range: {formatCurrency(marketData.rentalData.minRent)} - {formatCurrency(marketData.rentalData.maxRent)}</p>
                  <p>Median Rent/sqft: {formatCurrency(marketData.rentalData.medianRentPerSquareFoot)}</p>
                  <p>Median Days on Market: {marketData.rentalData.medianDaysOnMarket}</p>
                </div>
              </div>
              
              <h2 style={{ marginTop: '40px' }}>Return on Investment Calculator</h2>
              
              <div className="roi-calculator">
                <div className="roi-inputs">
                  <h3>Investment Parameters</h3>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Purchase Price ($)</label>
                    <input
                      type="number"
                      name="purchasePrice"
                      value={roiInputs.purchasePrice}
                      onChange={handleRoiInputChange}
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Down Payment (%)</label>
                    <input
                      type="number"
                      name="downPayment"
                      value={roiInputs.downPayment}
                      onChange={handleRoiInputChange}
                      min="0"
                      max="100"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Interest Rate (%)</label>
                    <input
                      type="number"
                      name="interestRate"
                      value={roiInputs.interestRate}
                      onChange={handleRoiInputChange}
                      min="0"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Loan Term (years)</label>
                    <input
                      type="number"
                      name="loanTerm"
                      value={roiInputs.loanTerm}
                      onChange={handleRoiInputChange}
                      min="1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Property Tax (% per year)</label>
                    <input
                      type="number"
                      name="propertyTax"
                      value={roiInputs.propertyTax}
                      onChange={handleRoiInputChange}
                      min="0"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Insurance (% per year)</label>
                    <input
                      type="number"
                      name="insurance"
                      value={roiInputs.insurance}
                      onChange={handleRoiInputChange}
                      min="0"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Maintenance (% per year)</label>
                    <input
                      type="number"
                      name="maintenance"
                      value={roiInputs.maintenance}
                      onChange={handleRoiInputChange}
                      min="0"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Vacancy (% of rental income)</label>
                    <input
                      type="number"
                      name="vacancy"
                      value={roiInputs.vacancy}
                      onChange={handleRoiInputChange}
                      min="0"
                      max="100"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                  
                  <div className="input-group" style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px' }}>Management Fee (% of rental income)</label>
                    <input
                      type="number"
                      name="managementFee"
                      value={roiInputs.managementFee}
                      onChange={handleRoiInputChange}
                      min="0"
                      max="100"
                      step="0.1"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="roi-results">
                  <h3>Investment Analysis</h3>
                  
                  <div className="result-card">
                    <h4>Monthly Rental Income</h4>
                    <p style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                      {formatCurrency(roiResults.monthlyRentalIncome)}
                    </p>
                  </div>
                  
                  <div className="result-card">
                    <h4>Monthly Cash Flow</h4>
                    <p style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: roiResults.monthlyCashFlow >= 0 ? '#4caf50' : '#f44336'
                    }}>
                      {formatCurrency(roiResults.monthlyCashFlow)}
                    </p>
                  </div>
                  
                  <div className="result-card">
                    <h4>Annual Cash Flow</h4>
                    <p style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: roiResults.annualCashFlow >= 0 ? '#4caf50' : '#f44336'
                    }}>
                      {formatCurrency(roiResults.annualCashFlow)}
                    </p>
                  </div>
                  
                  <div className="result-card">
                    <h4>Cash on Cash Return</h4>
                    <p style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: roiResults.cashOnCashReturn >= 0 ? '#4caf50' : '#f44336'
                    }}>
                      {formatPercentage(roiResults.cashOnCashReturn)}
                    </p>
                    <div className="progress-bar">
                      <div 
                        className="progress-bar-fill"
                        style={{ 
                          width: `${Math.min(Math.max(roiResults.cashOnCashReturn, 0), 20) * 5}%`,
                          backgroundColor: roiResults.cashOnCashReturn >= 0 ? '#4caf50' : '#f44336'
                        }}
                      ></div>
                    </div>
                    <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                      (Good: 8-12%, Excellent: &gt;12%)
                    </p>
                  </div>
                  
                  <div className="result-card">
                    <h4>Cap Rate</h4>
                    <p style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 'bold',
                      color: roiResults.capRate >= 0 ? '#4caf50' : '#f44336'
                    }}>
                      {formatPercentage(roiResults.capRate)}
                    </p>
                    <div className="progress-bar">
                      <div 
                        className="progress-bar-fill"
                        style={{ 
                          width: `${Math.min(Math.max(roiResults.capRate, 0), 15) * 6.67}%`,
                          backgroundColor: roiResults.capRate >= 0 ? '#4caf50' : '#f44336'
                        }}
                      ></div>
                    </div>
                    <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                      (Good: 5-8%, Excellent: &gt;8%)
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Calculation Properties Cards */}
              {marketData && roiResults.monthlyRentalIncome > 0 && roiResults.calculationDetails && (
                <div className="detailed-calculations">
                  <h2 style={{ marginTop: '40px' }}>Calculation Properties</h2>
                  <div className="market-stats-grid">
                    {/* Property Value Metrics */}
                    <div className="stat-card">
                      <h3>Property Value Metrics</h3>
                      <p><strong>Purchase Price:</strong> {formatCurrency(roiResults.calculationDetails.purchasePrice)}</p>
                      <p><strong>Down Payment:</strong> {formatPercentage(roiResults.calculationDetails.downPaymentPercent)}</p>
                      <p><strong>Down Payment Amount:</strong> {formatCurrency(roiResults.calculationDetails.downPaymentAmount)}</p>
                      <p><strong>Loan Amount:</strong> {formatCurrency(roiResults.calculationDetails.loanAmount)}</p>
                      <p><strong>Price per Sqft:</strong> {formatCurrency(marketData.saleData.medianPricePerSquareFoot)}</p>
                    </div>
                    
                    {/* Loan Details */}
                    <div className="stat-card">
                      <h3>Loan Details</h3>
                      <p><strong>Interest Rate:</strong> {formatPercentage(roiResults.calculationDetails.interestRate)}</p>
                      <p><strong>Loan Term:</strong> {roiResults.calculationDetails.loanTerm} years</p>
                      <p><strong>Monthly Interest Rate:</strong> {formatPercentage(roiResults.calculationDetails.monthlyInterestRate * 100)}</p>
                      <p><strong>Number of Payments:</strong> {roiResults.calculationDetails.numberOfPayments}</p>
                      <p><strong>Monthly Mortgage Payment:</strong> {formatCurrency(roiResults.calculationDetails.monthlyMortgagePayment)}</p>
                    </div>
                    
                    {/* Monthly Income */}
                    <div className="stat-card">
                      <h3>Monthly Income</h3>
                      <p><strong>Median Market Rent:</strong> {formatCurrency(marketData.rentalData.medianRent)}</p>
                      <p><strong>Monthly Rental Income:</strong> {formatCurrency(roiResults.calculationDetails.monthlyRentalIncome)}</p>
                      <p><strong>Vacancy Rate:</strong> {formatPercentage(roiInputs.vacancy)}</p>
                      <p><strong>Vacancy Cost:</strong> {formatCurrency(roiResults.calculationDetails.monthlyVacancy)}</p>
                      <p><strong>Effective Monthly Income:</strong> {formatCurrency(roiResults.calculationDetails.effectiveMonthlyIncome)}</p>
                    </div>
                    
                    {/* Monthly Expenses */}
                    <div className="stat-card">
                      <h3>Monthly Expenses</h3>
                      <p><strong>Mortgage Payment:</strong> {formatCurrency(roiResults.calculationDetails.monthlyMortgagePayment)}</p>
                      <p><strong>Property Tax:</strong> {formatCurrency(roiResults.calculationDetails.monthlyPropertyTax)}</p>
                      <p><strong>Insurance:</strong> {formatCurrency(roiResults.calculationDetails.monthlyInsurance)}</p>
                      <p><strong>Maintenance:</strong> {formatCurrency(roiResults.calculationDetails.monthlyMaintenance)}</p>
                      <p><strong>Management Fee:</strong> {formatCurrency(roiResults.calculationDetails.monthlyManagementFee)}</p>
                      <p><strong>Total Monthly Expenses:</strong> {formatCurrency(roiResults.calculationDetails.totalMonthlyExpenses)}</p>
                    </div>
                    
                    {/* Return Metrics */}
                    <div className="stat-card">
                      <h3>Return Metrics</h3>
                      <p><strong>Monthly Cash Flow:</strong> {formatCurrency(roiResults.calculationDetails.monthlyCashFlow)}</p>
                      <p><strong>Annual Cash Flow:</strong> {formatCurrency(roiResults.calculationDetails.annualCashFlow)}</p>
                      <p><strong>Annual Net Operating Income:</strong> {formatCurrency(roiResults.calculationDetails.annualNetOperatingIncome)}</p>
                      <p><strong>Cash on Cash Return:</strong> {formatPercentage(roiResults.calculationDetails.cashOnCashReturn)}</p>
                      <p><strong>Cap Rate:</strong> {formatPercentage(roiResults.calculationDetails.capRate)}</p>
                      <p><strong>Price-to-Rent Ratio:</strong> {(marketData.saleData.medianPrice / (marketData.rentalData.medianRent * 12)).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}
              {/* Detailed Calculation Section */}
              {marketData && roiResults.monthlyRentalIncome > 0 && (
                <div className="detailed-calculations">
                  <h2 style={{ marginTop: '40px' }}>Detailed ROI Calculations</h2>
                  <div className="calculation-steps">
                    <div className="calculation-section">
                      <h3>Mortgage Calculation</h3>
                      <div className="calculation-step">
                        <p><strong>Purchase Price:</strong> <span className="property-value">{formatCurrency(roiInputs.purchasePrice)}</span></p>
                        <p><strong>Down Payment:</strong> <span className="property-value">{formatPercentage(roiInputs.downPayment)}</span> = <span className="calculation-result">{formatCurrency(roiInputs.purchasePrice * (roiInputs.downPayment / 100))}</span></p>
                        <p><strong>Loan Amount:</strong> <span className="property-value">{formatCurrency(roiInputs.purchasePrice)}</span> - <span className="property-value">{formatCurrency(roiInputs.purchasePrice * (roiInputs.downPayment / 100))}</span> = <span className="calculation-result">{formatCurrency(roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100))}</span></p>
                        <p><strong>Interest Rate:</strong> {formatPercentage(roiInputs.interestRate)} annually = {formatPercentage(roiInputs.interestRate / 12)} monthly</p>
                        <p><strong>Loan Term:</strong> {roiInputs.loanTerm} years = {roiInputs.loanTerm * 12} monthly payments</p>
                        <p><strong>Monthly Mortgage Payment Formula:</strong> P × [r(1+r)^n] ÷ [(1+r)^n - 1]</p>
                        <p>Where:</p>
                        <ul>
                          <li>P = Loan amount: {formatCurrency(roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100))}</li>
                          <li>r = Monthly interest rate: {formatPercentage(roiInputs.interestRate / 12)}</li>
                          <li>n = Number of payments: {roiInputs.loanTerm * 12}</li>
                        </ul>
                        <p><strong>Monthly Mortgage Payment:</strong> {formatCurrency(
                          (roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100)) * 
                          ((roiInputs.interestRate / 100 / 12) * Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12)) / 
                          (Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12) - 1)
                        )}</p>
                      </div>
                    </div>

                    <div className="calculation-section">
                      <h3>Monthly Expenses Breakdown</h3>
                      <div className="calculation-step">
                        <p><strong>Monthly Mortgage Payment:</strong> <span className="expense-value">{formatCurrency(
                          (roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100)) * 
                          ((roiInputs.interestRate / 100 / 12) * Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12)) / 
                          (Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12) - 1)
                        )}</span></p>
                        <p><strong>Monthly Property Tax:</strong> <span className="property-value">{formatCurrency(roiInputs.purchasePrice)}</span> × <span className="expense-value">{formatPercentage(roiInputs.propertyTax)}</span> ÷ 12 = <span className="expense-value">{formatCurrency((roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12)}</span></p>
                        <p><strong>Monthly Insurance:</strong> <span className="property-value">{formatCurrency(roiInputs.purchasePrice)}</span> × <span className="expense-value">{formatPercentage(roiInputs.insurance)}</span> ÷ 12 = <span className="expense-value">{formatCurrency((roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12)}</span></p>
                        <p><strong>Monthly Maintenance:</strong> <span className="property-value">{formatCurrency(roiInputs.purchasePrice)}</span> × <span className="expense-value">{formatPercentage(roiInputs.maintenance)}</span> ÷ 12 = <span className="expense-value">{formatCurrency((roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12)}</span></p>
                        <p><strong>Monthly Vacancy Cost:</strong> <span className="income-value">{formatCurrency(roiResults.monthlyRentalIncome)}</span> × <span className="expense-value">{formatPercentage(roiInputs.vacancy)}</span> = <span className="expense-value">{formatCurrency(roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100))}</span></p>
                        <p><strong>Monthly Management Fee:</strong> <span className="income-value">{formatCurrency(roiResults.monthlyRentalIncome)}</span> × <span className="expense-value">{formatPercentage(roiInputs.managementFee)}</span> = <span className="expense-value">{formatCurrency(roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100))}</span></p>
                        <p><strong>Total Monthly Expenses:</strong> {formatCurrency(
                          (roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100)) * 
                          ((roiInputs.interestRate / 100 / 12) * Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12)) / 
                          (Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12) - 1) +
                          (roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                          roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                          roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)
                        )}</p>
                      </div>
                    </div>

                    <div className="calculation-section">
                      <h3>Cash Flow Calculation</h3>
                      <div className="calculation-step">
                        <p><strong>Monthly Rental Income:</strong> {formatCurrency(roiResults.monthlyRentalIncome)}</p>
                        <p><strong>Total Monthly Expenses:</strong> {formatCurrency(
                          (roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100)) * 
                          ((roiInputs.interestRate / 100 / 12) * Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12)) / 
                          (Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12) - 1) +
                          (roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                          roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                          roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)
                        )}</p>
                        <p><strong>Monthly Cash Flow:</strong> {formatCurrency(roiResults.monthlyRentalIncome)} - {formatCurrency(
                          (roiInputs.purchasePrice * (1 - roiInputs.downPayment / 100)) * 
                          ((roiInputs.interestRate / 100 / 12) * Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12)) / 
                          (Math.pow(1 + (roiInputs.interestRate / 100 / 12), roiInputs.loanTerm * 12) - 1) +
                          (roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                          roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                          roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)
                        )} = {formatCurrency(roiResults.monthlyCashFlow)}</p>
                        <p><strong>Annual Cash Flow:</strong> {formatCurrency(roiResults.monthlyCashFlow)} × 12 = {formatCurrency(roiResults.annualCashFlow)}</p>
                      </div>
                    </div>
                    <div className="calculation-section">
                      <h3>Return on Investment Metrics</h3>
                      <div className="calculation-step">
                        <p><strong>Initial Investment (Down Payment):</strong> {formatCurrency(roiInputs.purchasePrice)} × {formatPercentage(roiInputs.downPayment)} = {formatCurrency(roiInputs.purchasePrice * (roiInputs.downPayment / 100))}</p>
                        <p><strong>Cash on Cash Return:</strong> ({formatCurrency(roiResults.annualCashFlow)} ÷ {formatCurrency(roiInputs.purchasePrice * (roiInputs.downPayment / 100))}) × 100 = {formatPercentage(roiResults.cashOnCashReturn)}</p>
                        <p><strong>Annual Net Operating Income (NOI):</strong></p>
                        <ul>
                          <li>Annual Rental Income: {formatCurrency(roiResults.monthlyRentalIncome)} × 12 = {formatCurrency(roiResults.monthlyRentalIncome * 12)}</li>
                          <li>Annual Operating Expenses (excluding mortgage): {formatCurrency(
                            ((roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                            (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                            (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                            roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                            roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)) * 12
                          )}</li>
                          <li>NOI = Annual Rental Income - Annual Operating Expenses = {formatCurrency((roiResults.monthlyRentalIncome * 12) - 
                            ((roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                            (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                            (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                            roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                            roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)) * 12
                          )}</li>
                        </ul>
                        <p><strong>Cap Rate:</strong> ({formatCurrency((roiResults.monthlyRentalIncome * 12) - 
                          ((roiInputs.purchasePrice * (roiInputs.propertyTax / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.insurance / 100)) / 12 +
                          (roiInputs.purchasePrice * (roiInputs.maintenance / 100)) / 12 +
                          roiResults.monthlyRentalIncome * (roiInputs.vacancy / 100) +
                          roiResults.monthlyRentalIncome * (roiInputs.managementFee / 100)) * 12
                        )} ÷ {formatCurrency(roiInputs.purchasePrice)}) × 100 = {formatPercentage(roiResults.capRate)}</p>
                      </div>
                    </div>

                    <div className="calculation-section">
                      <h3>Market Analysis</h3>
                      <div className="calculation-step">
                        <p><strong>Price-to-Rent Ratio:</strong> {formatCurrency(marketData.saleData.medianPrice)} ÷ ({formatCurrency(marketData.rentalData.medianRent)} × 12) = {(marketData.saleData.medianPrice / (marketData.rentalData.medianRent * 12)).toFixed(2)}</p>
                        <p><strong>Interpretation:</strong></p>
                        <ul>
                          <li>Less than 15: Favorable for generating positive cash flow</li>
                          <li>15-20: Moderate potential for cash flow</li>
                          <li>Greater than 20: Challenging to generate strong cash flow</li>
                        </ul>
                        <p><strong>Market Rating:</strong> {
                          (marketData.saleData.medianPrice / (marketData.rentalData.medianRent * 12)) < 15 
                            ? "Favorable" 
                            : (marketData.saleData.medianPrice / (marketData.rentalData.medianRent * 12)) < 20 
                              ? "Moderate" 
                              : "Challenging"
                        }</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Investment Analysis Section */}
              {marketData && roiResults.monthlyRentalIncome > 0 && (
                <div className="investment-analysis">
                  {(() => {
                    const { rating, analysis, recommendations } = getInvestmentAnalysis();
                    return (
                      <>
                        <div className="analysis-header">
                          <h3>Investment Analysis</h3>
                          <span className={`analysis-rating ${rating}-rating`}>
                            {rating.charAt(0).toUpperCase() + rating.slice(1)}
                          </span>
                        </div>
                        
                        <p className="analysis-detail">{analysis}</p>
                        
                        {recommendations.length > 0 && (
                          <div className="analysis-recommendations">
                            <h4>Recommendations to Improve Returns:</h4>
                            <ul>
                              {recommendations.map((rec, index) => (
                                <li key={index}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarketStatistics;
