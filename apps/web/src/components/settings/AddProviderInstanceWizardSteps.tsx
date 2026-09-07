import { WizardSteps } from "../ui/wizard";
import { useI18n } from "../../i18n/WebI18nProvider";
import {
  ADD_PROVIDER_WIZARD_STEPS,
  resolveWizardNavigation,
  type WizardNavigation,
} from "./AddProviderInstanceDialog.logic";

interface AddProviderInstanceWizardStepsProps {
  readonly currentStep: number;
  readonly summaries: readonly (string | null)[];
  readonly instanceIdError: string | null;
  readonly onNavigation: (navigation: WizardNavigation) => void;
}

export function AddProviderInstanceWizardSteps({
  currentStep,
  summaries,
  instanceIdError,
  onNavigation,
}: AddProviderInstanceWizardStepsProps) {
  const { t } = useI18n();
  return (
    <WizardSteps
      steps={ADD_PROVIDER_WIZARD_STEPS}
      currentStep={currentStep}
      summaries={summaries}
      onStepChange={(requestedStep) =>
        onNavigation(
          resolveWizardNavigation(currentStep, requestedStep, ADD_PROVIDER_WIZARD_STEPS.length, {
            instanceIdError,
          }),
        )
      }
    />
  );
}
