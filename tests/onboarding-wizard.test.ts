import { describe, expect, it } from "vitest";



import {



  ASSISTANT_NAMING_COPY,



  continuityReadyMessage,



  nextWizardStep,



  previousWizardStep,



  wizardStepTitle,



} from "../src/shared/onboarding-wizard";







describe("onboarding wizard", () => {



  it("advances welcome → name assistant", () => {



    expect(nextWizardStep(1)).toBe(2);



    expect(nextWizardStep(2)).toBe(2);



  });







  it("walks back from name to welcome", () => {



    expect(previousWizardStep(2)).toBe(1);



    expect(previousWizardStep(1)).toBe(1);



  });







  it("uses consumer step titles", () => {



    expect(wizardStepTitle(1)).toMatch(/Welcome/i);



    expect(wizardStepTitle(2)).toMatch(/Name your assistant/i);



  });







  it("uses calm ready copy", () => {



    expect(continuityReadyMessage()).toMatch(/assistant is ready/i);



  });







  it("assistant naming copy allows skip", () => {



    expect(ASSISTANT_NAMING_COPY.hint).toMatch(/change this anytime/i);



    expect(ASSISTANT_NAMING_COPY.placeholder).toBe("Assistant");



  });



});




