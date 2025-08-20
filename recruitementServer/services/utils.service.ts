import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UtilsService {
  constructor() { }

  // Experience Calculation Method 
  calculateDuration(
    fromDate: Date,
    toDate: Date,
    fieldWeightage: number = 1,
    returnType: 'rawDuration' | 'decimalYears' | 'days' = 'decimalYears'
  ): any {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const msInDay = 1000 * 60 * 60 * 24;
    const durationInDays = Math.round((end.getTime() - start.getTime()) / msInDay);
    const decimalYears = durationInDays / 365.25;

    if (returnType === 'days') {
      return Math.round(durationInDays * fieldWeightage);
    }

    if (returnType === 'decimalYears') {
      return +(decimalYears * fieldWeightage).toFixed(4);
    }

    const years = Math.floor(durationInDays / 365);
    const months = Math.floor((durationInDays % 365) / 30);
    const days = (durationInDays % 365) % 30;

    return { years, months, days };
  }

  calculateTotalExperience(
    experiences: {
      from: Date;
      to: Date;
      weight: number;
      toMaxvalue: number; // no longer used in logic
    }[],
    parentWeightage: number
  ): {
    totalDays: number;
    totalDecimalYears: number;
    isParentWeightageValid: boolean;
    todayExperience: { from: Date; to: Date };
    score_field_calculated_value: number;
    details: {
      from: string;
      to: string;
      Score_field_value: number;
      Score_field_actual_value: number;
      Score_field_calculated_value: number;
    }[];
  } {
    let totalDays = 0;
    const details = [];

    for (const exp of experiences) {
      const days = this.calculateDuration(exp.from, exp.to, exp.weight, 'days');
      const actualYears = +(days / 365.25).toFixed(4);

      const finalvalue = actualYears > exp.toMaxvalue ? exp.toMaxvalue : actualYears;

      totalDays += days;

      details.push({
        from: this.formatDate(exp.from),
        to: this.formatDate(exp.to),
        Score_field_value: days,
        Score_field_actual_value: actualYears,
        Score_field_calculated_value: finalvalue,
      });
    }

    const totalDecimalYears = +(totalDays / 365.25).toFixed(4);
    const isParentWeightageValid = totalDecimalYears <= parentWeightage;
    const finalParentValue = isParentWeightageValid ? totalDecimalYears : parentWeightage;
    const result = {
      totalDays,
      totalDecimalYears,
      isParentWeightageValid,
      todayExperience: experiences[experiences.length - 1],
      score_field_calculated_value: finalParentValue,
      details,
    };

    // 🟢 Console logs
    // console.log('🟢 JSON Each Experience Details:', JSON.stringify(result.details, null, 2));
    // console.log('Score_field_value (Total Days):', result.totalDays);
    // console.log('Score_field_actual_value (Decimal Years):', result.totalDecimalYears);
    // console.log('Score_field_calculated_value:', result.score_field_calculated_value);

    return result;
  }

  private formatDate(date: Date): string {
    return new Date(date).toISOString().split('T')[0];
  }

  // Education Calculatiion Marks Calculation Method
  calculateEducationScoreOLd(
    educations: {
      weight: number;     // weightage of the field
      inputValue: number; // marks/percentage
    }[],
    parentFieldMarks: number // max marks from parent field
  ): {
    total_actual_value: number;
    score_field_calculated_value: number;
    details: {
      weight: number;
      inputValue: number;
      score_field_actual_value: number;
    }[];
  } {
    let total_actual_value = 0;
    const details = educations.map(edu => {
      const score_field_actual_value = +(edu.weight * (edu.inputValue / 10)).toFixed(4);
      total_actual_value += score_field_actual_value;
      return {
        weight: edu.weight,
        inputValue: edu.inputValue,
        score_field_actual_value
      };
    });

    const score_field_calculated_value =
      total_actual_value <= parentFieldMarks
        ? +total_actual_value.toFixed(4)
        : +parentFieldMarks.toFixed(4);

    return {
      total_actual_value: +total_actual_value.toFixed(4),
      score_field_calculated_value,
      details
    };
  }

  calculateEducationScore(
    educations: {
      scoreFieldId: number; // Score_Field_Id,
      weight: number;
      inputValue: number; // Score_Field_Value
      maxValue?: number;  // optional cap for individual field
    }[],
    parentFieldMarks: number
  ): {
    total_actual_value: number;
    score_field_calculated_value: number;
    details: {
      scoreFieldId: number; // Score_Field_Id,
      weight: number;
      inputValue: number;
      score_field_actual_value: number;
      score_field_calculated_value: number;
    }[];
  } {
    let total_actual_value = 0;
    let total_calculated_value = 0;

    const details = educations.map(edu => {
      const actual_value = +(edu.inputValue * edu.weight / 10).toFixed(4);
      const calculated_value = edu.maxValue !== undefined
        ? Math.min(actual_value, edu.maxValue)
        : actual_value;
      // const calculated_value = actual_value > (edu.maxValue || 0) ? edu.maxValue || 0 : actual_value;

      total_actual_value += actual_value;
      total_calculated_value += calculated_value;

      return {
        scoreFieldId: edu.scoreFieldId,
        weight: edu.weight,
        inputValue: edu.inputValue,
        score_field_actual_value: actual_value,
        score_field_calculated_value: + calculated_value.toFixed(4)
      };
    });

    const score_field_calculated_value =
      total_calculated_value <= parentFieldMarks
        ? +total_calculated_value.toFixed(4)
        : +parentFieldMarks.toFixed(4);


    // const score_field_calculated_value = total_calculated_value < parentFieldMarks ? parentFieldMarks : +total_calculated_value.toFixed(4);

    return {
      total_actual_value: + total_calculated_value.toFixed(4),
      score_field_calculated_value,
      details
    };
  }

  //Qauntity Calculation Method
  calculateQuantityBasedScore(
  quantityScoreInput: {
    scoreFieldId: number;
    quantity: number;
    weightage: number;
    scoreFieldMarks: number;
  }[],
  parentScoreFieldMarks: number
): {
  total_actual_value: number; // sum of all final marks
  score_field_calculated_value: number; // capped at parent max
  details: {
    scoreFieldId: number;
    quantity: number;
    weightage: number;
    scoreFieldMarks: number;
    calculatedMarks: number;
    finalMarks: number;
  }[];
} {
  let totalFinalMarks = 0;

  const details = quantityScoreInput.map(input => {
    const calculatedMarks = +(input.quantity * input.weightage).toFixed(2);
    const finalMarks = Math.min(calculatedMarks, input.scoreFieldMarks);
    totalFinalMarks += finalMarks;
    return {
      scoreFieldId: input.scoreFieldId,
      quantity: input.quantity,
      weightage: input.weightage,
      scoreFieldMarks: input.scoreFieldMarks,
      calculatedMarks,
      finalMarks
    };
  });
  const cappedFinal = Math.min(totalFinalMarks, parentScoreFieldMarks);
  return {
    total_actual_value: +totalFinalMarks.toFixed(2),
    score_field_calculated_value: +cappedFinal.toFixed(2),
    details
  };
}


}
