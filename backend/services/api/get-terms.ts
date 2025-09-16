// services/api/get-terms.ts
// Endpoint to fetch available terms from UW aggregate API

export const handler = async (evt: any) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight OPTIONS request
  if (evt.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const response = await fetch("https://public.enroll.wisc.edu/api/search/v1/aggregate", {
      headers: {
        "accept": "application/json",
        "user-agent": "badger-class-tracker/1.0 (educational use)",
      },
    });

    if (!response.ok) {
      throw new Error(`UW API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract terms from the aggregate response
    const terms = data.terms || [];
    
    // Helper function to decode UW term codes into readable names
    const decodeTermCode = (termCode: string): string => {
      if (termCode.length !== 4) return `Term ${termCode}`;

      const firstThree = parseInt(termCode.substring(0, 3));
      const lastDigit = termCode.substring(3);

      // Decode year: first 3 digits = 100 + (year - 2000) * 10 + semester_offset
      const year = 2000 + Math.floor((firstThree - 100) / 10);

      // Decode semester from last digit
      let semesterName;
      switch (lastDigit) {
        case '4': semesterName = 'Spring'; break;
        case '6': semesterName = 'Summer'; break;
        case '2': semesterName = 'Fall'; break;
        default: semesterName = `Semester ${lastDigit}`; break;
      }

      return `${year} ${semesterName}`;
    };

    // Transform to a more frontend-friendly format with consistent "Semester Year" format
    const formattedTerms = terms.map((term: any) => ({
      value: term.termCode,
      label: (() => {
        if (term.shortDescription) {
          // Convert "2025 Fall" to "Fall 2025"
          const parts = term.shortDescription.split(' ');
          if (parts.length === 2) {
            return `${parts[1]} ${parts[0]}`;
          }
          return term.shortDescription;
        }
        return term.longDescription || decodeTermCode(term.termCode);
      })(),
      startDate: term.startDate,
      endDate: term.endDate,
      current: term.current || false
    }));

    // Add "All Terms" option at the beginning
    const allTermsOption = { 
      value: "0000", 
      label: "All Terms", 
      startDate: null, 
      endDate: null, 
      current: false 
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        terms: [allTermsOption, ...formattedTerms]
      }),
    };
  } catch (error) {
    console.error("Get terms error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: (error as Error).message 
      }),
    };
  }
};