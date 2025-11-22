import {
  Component,
  OnInit,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
  FormControl,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { HttpService, LoaderService } from 'shared';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { UtilsService } from '../../../services/utils.service';
import { AlertService } from 'shared';
import {
  RecruitmentStateService,
  UserRecruitmentData,
} from '../../../services/recruitment-state.service';
interface DetailFormGroup {
  type: FormControl<string | null>;
  _rowIndex: FormControl<number | null>; // Explicitly define _rowIndex
  [key: string]: AbstractControl; // Allow any type of form control
}
interface SubHeading {
  m_rec_score_field_id: number;
  score_field_name_e: string;
  score_field_is_mandatory: string;
  a_rec_adv_post_detail_id: number;
  score_field_field_marks: number;
  score_field_field_weightage: number;
  score_field_parent_code?: number | null;
  score_field_title_name?: string;
  score_field_flag?: string | null;
  message?: string | null;
  m_rec_score_field_method_id?: number;
  score_field_validation_marks?: number;
  score_field_display_no?: number;
  score_field_is_attachment_required?: string;
  score_field_no_of_rows?: number;
  items: {
    m_rec_score_field_id: number;
    score_field_name_e: string;
    normalizedKey: string;
    is_mandatory: string; // Now required, as API provides score_field_is_mandatory
    score_field_field_marks: number;
    score_field_field_weightage: number;
    score_field_parent_code?: number;
    score_field_title_name?: string;
    score_field_flag?: string | null;
    message?: string | null;
    m_rec_score_field_method_id?: number;
    score_field_validation_marks?: number;
    score_field_display_no?: number;
    score_field_is_attachment_required?: string;
    score_field_no_of_rows?: number;
  }[];
}
interface Parameter {
  m_rec_score_field_id: number;
  m_rec_score_field_parameter_new_id: number;
  score_field_parameter_name: string;
  normalizedKey: string;
  control_type: string;
  is_mandatory: string;
  parameter_display_order: number;
  isQuery_id: number;
  isDatatype: string;
  score_field_parent_id: number;
  dropdownOptions?: any[];
}
@Component({
  selector: 'app-step-3',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, HttpClientModule],
  templateUrl: './step-3.component.html',
  styleUrls: ['./step-3.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Step3Component implements OnInit {
  @Output() formData = new EventEmitter<{ [key: string]: any }>();
  form: FormGroup;
  isEditing: boolean = true;
  subHeadings: any[] = [];
  subHeadingRows: { [key: string]: any[] } = {};
  parameters: any[] = [];
  score_field_title_name: string | undefined;
  filePaths: Map<string, string> = new Map();
  existingDetailIds: Map<string, number> = new Map();
  existingParameterIds: Map<string, number> = new Map();
  private isGeneratingTable: boolean = false;
  subHeadingParameters: { [key: string]: any[] } = {};
  subHeadingDetails: { [key: string]: FormGroup<DetailFormGroup>[] } = {};
  heading: any;
  existingParentDetailId: number | null = null;
  dropdownData: Map<number, any[]> = new Map<number, any[]>();
  private previousCounts: Map<string, number> = new Map();
  private userData: UserRecruitmentData | null = null;
  private parameterIdsToDelete: number[] = [];
  private highestRowIndexMap: Map<string, number> = new Map();
  dawapattiData: Map<string, { remark: string; document: string | null }> =
    new Map();
  constructor(
    private fb: FormBuilder,
    private HTTP: HttpService,
    private sanitizer: DomSanitizer,
    private cdr: ChangeDetectorRef,
    private utils: UtilsService,
    private alertService: AlertService,
    private recruitmentState: RecruitmentStateService,
    private loader: LoaderService
  ) {
    this.form = this.fb.group({
      subHeadings: this.fb.group({}),
      details: this.fb.array([]),
      firstMissedMandatory: [''],
      mandatorySubheadingsSelected: [false, Validators.requiredTrue],
    });
    this.userData = this.recruitmentState.getScoringCandidateData();
  }

  get detailsArray(): FormArray<FormGroup<DetailFormGroup>> {
    return this.form.get('details') as FormArray<FormGroup<DetailFormGroup>>;
  }

  ngOnInit(): void {
    this.loader.showLoader();
    this.loadFormStructure();
    this.form.get('subHeadings')?.valueChanges.subscribe(() => {
      this.generateDetailsTable();
      this.checkMandatorySubheadingsAndParameters();
      this.cdr.detectChanges();
    });
    this.form.get('details')?.valueChanges.subscribe(() => {
      this.checkMandatorySubheadingsAndParameters();
      this.cdr.detectChanges();
    });
  }
private getDawapattiInfo(
    a_rec_app_main_id: number,
    score_field_parent_id: number,
    m_rec_score_field_id: number,
    parameter_row_index: number
  ): Observable<{ remark: string; document: string | null }> {
    return this.HTTP.getParam(
      '/candidate/get/getDawapattiDocumentAndRemark',
      {
        a_rec_app_main_id,
        score_field_parent_id,
        m_rec_score_field_id,
        parameter_row_index,
      },
      'recruitement'
    ).pipe(
      map((res: any) => {
        const data = res?.body?.data?.[0];
        if (data && (data.candidate_remark || data.candidate_document)) {
          return {
            remark: data.candidate_remark,
            document: data.candidate_document,
          };
        }
        return { remark: '', document: null }; // No dawapatti found
      }),
      catchError(() => of({ remark: '', document: null })) // Handle errors gracefully
    );
  }

  public getDawapattiForRow(detailForm: AbstractControl): { remark: string; document: string | null } | null {
    const typeValue = detailForm.get('type')?.value;
    const rowIndex = detailForm.get('_rowIndex')?.value;
    if (!typeValue || !rowIndex) return null;

    const scoreFieldId = Number(typeValue);
    const subHeading = this.subHeadings.find((sub) =>
      sub.items.some((item: any) => item.m_rec_score_field_id === scoreFieldId)
    );
    if (!subHeading) return null;

    const subHeadingId = subHeading.m_rec_score_field_id;
    const rowKey = `${subHeadingId}_${scoreFieldId}_${rowIndex}`;
    
    // Return data only if it exists in the map
    return this.dawapattiData.get(rowKey) || null;
  }
  public getExistingRowCount(item: any): number {
    if (!item || !this.detailsArray) {
      return 0;
    }
    const typeValue = item.m_rec_score_field_id.toString();
    return this.detailsArray.controls.filter(
      (control) => control.get('type')?.value === typeValue
    ).length;
  }
  private getDropdownData(
    queryId: number,
    extraParams: { [key: string]: any } = {} // ✅ ADD extraParams argument
  ): Observable<any[]> {
    if (!queryId || queryId === 0) {
      return of([]);
    }

    // ✅ MERGE the query_id with any extra parameters
    const payload = { query_id: queryId, ...extraParams };

    return this.HTTP.getParam(
      '/master/get/getDataByQueryId',
      payload, // ✅ USE the combined payload
      'recruitement'
    ).pipe(
      map((res: any) => res?.body?.data || []),
      catchError(() => of([]))
    );
  }

  // ✅ NEW: Logic to handle row deletion
  removeRow(detailForm: AbstractControl): void {
    // ✅ Ask for confirmation before doing anything else
    this.alertService
      .confirmAlert(
        'Confirm Deletion',
        'Are you sure you want to remove this row? This will be saved on the next "Save & Continue".',
        'warning'
      )
      .then((result: any) => {
        // ✅ Only proceed if the user confirms
        if (result.isConfirmed) {
          const typeValue = detailForm.get('type')?.value;
          const globalIndex = this.detailsArray.controls.indexOf(
            detailForm as FormGroup<DetailFormGroup>
          );

          if (!typeValue || globalIndex < 0) return;

          // --- Logic to capture existing IDs for deletion ---
          const subHeading = this.subHeadings.find((sub) =>
            sub.items.some(
              (item: any) => item.m_rec_score_field_id.toString() === typeValue
            )
          );
          const rowIndex = detailForm.get('_rowIndex')?.value;
          if (subHeading) {
            const indexInfo = this.getSubheadingScopedIndex(globalIndex);
            const paramsForSubheading = this.getParametersForSubHeading(
              subHeading.m_rec_score_field_id
            );

            if (indexInfo) {
              paramsForSubheading.forEach((param) => {
                const paramKey = `${subHeading.m_rec_score_field_id}_${typeValue}_${param.m_rec_score_field_parameter_new_id}_${rowIndex}`;
                if (this.filePaths.has(paramKey)) {
                  this.filePaths.delete(paramKey);
                }
                if (this.existingParameterIds.has(paramKey)) {
                  const idToDelete = this.existingParameterIds.get(paramKey)!;
                  if (!this.parameterIdsToDelete.includes(idToDelete)) {
                    this.parameterIdsToDelete.push(idToDelete);
                  }
                }
              });
            }
          }

          // --- Remove the row and update the UI ---
          this.detailsArray.removeAt(globalIndex);

          const item = subHeading?.items.find(
            (i: any) => i.m_rec_score_field_id.toString() === typeValue
          );
          if (item) {
            const countControl = this.form.get(
              `subHeadings.${subHeading.m_rec_score_field_id}.${item.normalizedKey}.count`
            );
            if (countControl) {
              const currentCount = this.detailsArray.controls.filter(
                (c) => c.get('type')?.value === typeValue
              ).length;
              countControl.setValue(
                currentCount > 0 ? currentCount.toString() : null,
                { emitEvent: false }
              );
            }
          }

          this.generateDetailsTable();
          this.checkMandatorySubheadingsAndParameters();
          this.cdr.markForCheck();
        }
        // If the user clicks "No" or cancels, do nothing.
      });
  }

  // In step-3.component.ts

  private checkMandatorySubheadingsAndParameters(): void {
    let firstMissedMandatory = '';
    let firstMissedParameter = '';
    let firstMissedSubheading = '';
    let aMandatoryItemWasMissed = false;

    // Part 1: Check if any mandatory ITEM has a count of zero.
    // This loop structure is changed to correctly find the first error.
    mainLoop: for (const sub of this.subHeadings) {
      const subGroup = this.form.get(
        `subHeadings.${sub.m_rec_score_field_id}`
      ) as FormGroup;
      if (!subGroup) continue;

      const subGroupValues = subGroup.getRawValue();

      for (const item of sub.items) {
        // ✅ FIX: Directly check if the ITEM is mandatory, regardless of the parent subheading.
        if (item.is_mandatory === '1') {
          const count = subGroupValues[item.normalizedKey]?.count
            ? parseInt(subGroupValues[item.normalizedKey].count, 10)
            : 0;

          if (count <= 0) {
            firstMissedMandatory = `${sub.score_field_name_e} - ${item.score_field_name_e}`;
            aMandatoryItemWasMissed = true;
            break mainLoop; // Found the first error, exit all loops.
          }
        }
      }
    }

    // Part 2: If all mandatory item counts are valid, then check the table row parameters.
    if (!aMandatoryItemWasMissed) {
      rowLoop: for (const sub of this.subHeadings) {
        const formArray = this.getRowsForSubHeading(sub.m_rec_score_field_id);
        const params = this.getParametersForSubHeading(
          sub.m_rec_score_field_id
        );

        for (const group of formArray) {
          const item = sub.items.find(
            (i: any) =>
              i.m_rec_score_field_id.toString() === group.get('type')?.value
          );
          if (!item) continue;

          for (const param of params) {
            if (param.is_mandatory === 'Y' || param.is_mandatory === '1') {
              const control = group.get(param.normalizedKey);
              let isControlInvalid = !!control?.invalid;

              if (param.control_type === 'A') {
                const globalIndex = this.detailsArray.controls.indexOf(
                  group as FormGroup<DetailFormGroup>
                );
                const filePath = this.getFilePath(
                  group, // Pass the whole form group
                  param.m_rec_score_field_parameter_new_id,
                  sub.m_rec_score_field_id
                );
                if (filePath) {
                  isControlInvalid = false;
                }
              }

              if (isControlInvalid) {
                firstMissedParameter = param.score_field_parameter_name;
                firstMissedSubheading = item.score_field_name_e;
                break rowLoop;
              }
            }
          }
        }
      }
    }

    // Set the final validation state of the form.
    const allMandatoryValid = !firstMissedMandatory && !firstMissedParameter;
    this.form
      .get('mandatorySubheadingsSelected')
      ?.setValue(allMandatoryValid, { emitEvent: false });
    this.form
      .get('firstMissedMandatory')
      ?.setValue(
        firstMissedMandatory ||
          (firstMissedParameter
            ? `${firstMissedParameter} under ${firstMissedSubheading} is missing`
            : ''),
        { emitEvent: false }
      );
  }

  normalizeControlName(name: any): string {
    return typeof name === 'string'
      ? name.toLowerCase().replace(/[^a-z0-9_]/gi, '_')
      : '';
  }

  hasParameter(subHeadingId: string | number, parameterName: string): boolean {
    const key = subHeadingId.toString();
    return this.subHeadingParameters[key]?.some(
      (p) => p.score_field_parameter_name === parameterName
    );
  }

  hasSubHeadingRows(subHeadingId: number): boolean {
    const key = subHeadingId.toString();
    const hasRows = !!this.subHeadingDetails[key]?.length;
    return hasRows;
  }

  getCountOptions(): number[] {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }

  getCheckboxName(detailForm: AbstractControl): string {
    const typeValue = detailForm.get('type')?.value;
    for (const subHeading of this.subHeadings) {
      const item = subHeading.items.find(
        (item: any) => item.m_rec_score_field_id.toString() === typeValue
      );
      if (item) {
        return item.score_field_name_e || typeValue || '';
      }
    }
    return typeValue || '';
  }

  isRowType(detailForm: AbstractControl, subHeadingId: number): boolean {
    const typeValue = detailForm.get('type')?.value;
    return typeValue === subHeadingId.toString();
  }

  getRowsForSubHeading(subHeadingId: number): FormGroup<DetailFormGroup>[] {
    const key = subHeadingId.toString();
    const rows = this.subHeadingDetails[key] || [];

    return rows;
  }

  getParametersForSubHeading(subHeadingId: number | string): any[] {
    return this.subHeadingParameters[subHeadingId.toString()] || [];
  }
  private getSubheadingScopedIndex(
    globalIndex: number
  ): { subHeadingId: number; scopedIndex: number } | null {
    const row = this.detailsArray.at(globalIndex);
    const typeValue = row?.get('type')?.value;
    if (!typeValue) {
      return null;
    }

    const scoreFieldId = Number(typeValue);
    const subHeading = this.subHeadings.find((sub) =>
      sub.items.some((item: any) => item.m_rec_score_field_id === scoreFieldId)
    );
    if (!subHeading) {
      return null;
    }

    const subHeadingId = subHeading.m_rec_score_field_id;
    let scopedIndex = 0;
    for (let i = 0; i <= globalIndex; i++) {
      const currentRow = this.detailsArray.at(i);
      const currentTypeValue = currentRow?.get('type')?.value;
      if (!currentTypeValue) {
        continue;
      }
      const currentScoreFieldId = Number(currentTypeValue);
      const currentSubHeading = this.subHeadings.find((sub) =>
        sub.items.some(
          (item: any) => item.m_rec_score_field_id === currentScoreFieldId
        )
      );
      if (
        currentSubHeading &&
        currentSubHeading.m_rec_score_field_id === subHeadingId
      ) {
        scopedIndex++;
      }
    }
    return { subHeadingId, scopedIndex };
  }
  getFilePath(
    detailForm: AbstractControl, // Pass the whole form group
    paramId: number,
    subHeadingId: number
  ): string | null {
    const scoreFieldId = detailForm.get('type')?.value;
    const rowIndex = detailForm.get('_rowIndex')?.value; // <-- Get stable index from the control

    if (!scoreFieldId || !rowIndex) {
      return null;
    }

    const key = `${subHeadingId}_${scoreFieldId}_${paramId}_${rowIndex}`;
    return this.filePaths.get(key) || null;
  }
  sanitizeFileUrl(filePath: string): SafeUrl {
    // filePath from the DB is already in the format "recruitment/24000001/filename.pdf"
    // We can use it directly to build the URL.
    const url = `http://192.168.1.57:3500/${filePath}`;
    return this.sanitizer.bypassSecurityTrustUrl(url);
  }

  getFileName(filePath: string): string {
    return filePath.split('\\').pop() || 'Unknown File';
  }
  private createDataRequest(
    flag: 'S' | 'E'
  ): Observable<{ parent: any; children: any[] }> {
    const registrationNo = this.userData?.registration_no;
    const a_rec_adv_main_id = this.userData?.a_rec_adv_main_id; // The parent request with the flag
    const a_rec_app_main_id = this.userData?.a_rec_app_main_id;
    const parentRequest = this.HTTP.getData(
      `/candidate/get/getParameterValues?registration_no=${registrationNo}&a_rec_app_main_id=${a_rec_app_main_id}&score_field_parent_id=0&m_rec_score_field_id=${this.heading.m_rec_score_field_id}&Application_Step_Flag_CES=${flag}`,
      'recruitement'
    ); // The children requests with the flag

    const childParentIds = this.subHeadings.map((s) => s.m_rec_score_field_id);
    const childrenRequests = childParentIds.map((id) =>
      this.HTTP.getData(
        `/candidate/get/getParameterValues?registration_no=${registrationNo}&a_rec_app_main_id=${a_rec_app_main_id}&score_field_parent_id=${id}&Application_Step_Flag_CES=${flag}`,
        'recruitement'
      )
    );

    return forkJoin({
      parent: parentRequest,
      children:
        childrenRequests.length > 0 ? forkJoin(childrenRequests) : of([]),
    });
  }
  public getRowVerificationStatus(detailForm: AbstractControl): string | null {
    // Get the 'type' (m_rec_score_field_id) from the row's form group
    const typeValue = detailForm.get('type')?.value;
    if (!typeValue) {
      return null;
    } // Find the parent subheading that this item belongs to

    const subHeading = this.subHeadings.find((sub) =>
      sub.items.some(
        (item: any) => item.m_rec_score_field_id.toString() === typeValue
      )
    );
    if (!subHeading) {
      return null;
    } // Get all parameters for that subheading

    const params = this.getParametersForSubHeading(
      subHeading.m_rec_score_field_id
    ); // Find the specific "Verify Status" parameter using its master ID (3) // Note: This assumes 'm_parameter_master_id' is present on your parameter objects

    const verifyStatusParam = params.find(
      (p) => p.m_parameter_master_id === 3
    );
    if (!verifyStatusParam) {
      return null;
    } // Get the form control name for the status parameter

    const controlName = verifyStatusParam.normalizedKey; // Return the current value of that control from the row's form group

    return detailForm.get(controlName)?.value;
  }
  private getParameterValuesAndPatch(): void {
    if (!this.heading) {
      console.warn('Heading not loaded, cannot patch values.');
      this.loader.hideLoader();
      return;
    }

    this.createDataRequest('S')
      .pipe(
        switchMap(({ parent, children }) => {
          const screenerChildrenData = children.flatMap(
            (res: any) => res.body?.data || []
          );

          if (screenerChildrenData.length > 0) {
            return of({
              parentData: parent.body?.data || [],
              childrenData: screenerChildrenData,
              type: 'S',
            });
          } else {
            return this.createDataRequest('E').pipe(
              map((candidateResult) => ({
                parentData: candidateResult.parent.body?.data || [],
                childrenData: candidateResult.children.flatMap(
                  (res: any) => res.body?.data || []
                ),
                type: 'E',
              }))
            );
          }
        })
      )
      .subscribe({
        next: ({ parentData, childrenData, type }) => {
          this.detailsArray.clear();
          this.filePaths.clear();
          this.existingDetailIds.clear();
          this.existingParameterIds.clear();
          this.highestRowIndexMap.clear();
          Object.keys(this.subHeadingDetails).forEach(
            (key) => (this.subHeadingDetails[key] = [])
          );

          if (type === 'S' && parentData.length > 0) {
            this.existingParentDetailId =
              parentData[0].a_rec_app_score_field_detail_id;
          } else {
            this.existingParentDetailId = null;
          }

          const savedChildrenData = childrenData;
          const rowsGroupedByUniqueKey = new Map<string, any[]>();

          savedChildrenData.forEach((record) => {
            const uniqueRowKey = `${record.score_field_parent_id}_${record.m_rec_score_field_id}_${record.parameter_row_index}`;
            if (!rowsGroupedByUniqueKey.has(uniqueRowKey)) {
              rowsGroupedByUniqueKey.set(uniqueRowKey, []);
            }
            rowsGroupedByUniqueKey.get(uniqueRowKey)!.push(record);

            if (type === 'S') {
              const detailKey = `${record.score_field_parent_id}_${record.m_rec_score_field_id}`;
              this.existingDetailIds.set(
                detailKey,
                record.a_rec_app_score_field_detail_id
              );
            }
          });

          rowsGroupedByUniqueKey.forEach((rowData, uniqueRowKey) => {
            if (rowData.length === 0) return;

            const [subHeadingIdStr, scoreFieldIdStr, rowIndexStr] =
              uniqueRowKey.split('_');
            const subHeadingId = Number(subHeadingIdStr);
            const scoreFieldId = Number(scoreFieldIdStr);
            const rowIndex = Number(rowIndexStr);

            const mapKey = `${subHeadingId}_${scoreFieldId}`;
            const currentMax = this.highestRowIndexMap.get(mapKey) || 0;
            if (rowIndex > currentMax) {
              this.highestRowIndexMap.set(mapKey, rowIndex);
            }

            const newGroup = this.createDetailGroup(
              scoreFieldId.toString(),
              subHeadingId,
              rowIndex
            );

            rowData.forEach((paramData) => {
              const param = this.getParametersForSubHeading(subHeadingId).find(
                (p) =>
                  p.m_rec_score_field_parameter_new_id ===
                  paramData.m_rec_score_field_parameter_new_id
              );
              if (param) {
                const controlName = param.normalizedKey;
                const paramKey = `${subHeadingId}_${scoreFieldId}_${param.m_rec_score_field_parameter_new_id}_${rowIndex}`;

                if (type === 'S') {
                  this.existingParameterIds.set(
                    paramKey,
                    paramData.a_rec_app_score_field_parameter_detail_id
                  );
                }

                if (paramData.parameter_value?.includes('/')) {
                  this.filePaths.set(paramKey, paramData.parameter_value);
                  newGroup
                    .get(controlName)
                    ?.setValue('FILE_UPLOADED', { emitEvent: false });
                } else {
                  newGroup
                    .get(controlName)
                    ?.setValue(paramData.parameter_value, {
                      emitEvent: false,
                    });
                }
              }
            });
            this.detailsArray.push(newGroup);
          });

          this.detailsArray.controls.forEach((control) => {
            const typeValue = control.get('type')?.value;
            const subHeading = this.subHeadings.find((sh) =>
              sh.items.some(
                (item: any) =>
                  item.m_rec_score_field_id.toString() === typeValue
              )
            );
            if (subHeading) {
              const key = subHeading.m_rec_score_field_id.toString();
              this.subHeadingDetails[key].push(
                control as FormGroup<DetailFormGroup>
              );
            }
          });

          const itemCounts = new Map<number, number>();
          this.detailsArray.controls.forEach((control) => {
            const scoreFieldId = Number(control.get('type')?.value);
            itemCounts.set(
              scoreFieldId,
              (itemCounts.get(scoreFieldId) || 0) + 1
            );
          });

          this.subHeadings.forEach((subHeading) => {
            const subGroup = this.form.get(
              `subHeadings.${subHeading.m_rec_score_field_id}`
            ) as FormGroup;
            if (subGroup) {
              subHeading.items.forEach((item: any) => {
                const count = itemCounts.get(item.m_rec_score_field_id) || 0;
                subGroup
                  .get(`${item.normalizedKey}.count`)
                  ?.setValue(count > 0 ? count.toString() : null, {
                    emitEvent: false,
                  });
              });
            }
          });

         this.dawapattiData.clear(); // Clear old data

          if (!this.userData?.a_rec_app_main_id) {
            this.loader.hideLoader(); // Hide loader if we can't proceed
            this.cdr.markForCheck();
            return; // Can't fetch dawapatti without app main id
          }

          const appMainId = this.userData.a_rec_app_main_id;
          const dawapattiRequests: Observable<any>[] = [];

          this.detailsArray.controls.forEach(rowControl => {
              const typeValue = rowControl.get('type')?.value;
              const rowIndex = rowControl.get('_rowIndex')?.value;
              if (!typeValue || !rowIndex) return;

              const scoreFieldId = Number(typeValue);
              const subHeading = this.subHeadings.find((sub) =>
                  sub.items.some((item: any) => item.m_rec_score_field_id === scoreFieldId)
              );
              if (!subHeading) return;

              const subHeadingId = subHeading.m_rec_score_field_id;
              // This key MUST match the one used in getDawapattiForRow
              const rowKey = `${subHeadingId}_${scoreFieldId}_${rowIndex}`; 

              dawapattiRequests.push(
                  this.getDawapattiInfo(appMainId, subHeadingId, scoreFieldId, rowIndex).pipe(
                      map(dawapattiInfo => ({
                          key: rowKey,
                          data: dawapattiInfo
                      }))
                  )
              );
          });

          if (dawapattiRequests.length > 0) {
              forkJoin(dawapattiRequests).subscribe({
                  next: (results: any[]) => {
                      results.forEach(result => {
                          if (result.data.document || result.data.remark) {
                              this.dawapattiData.set(result.key, result.data);
                          }
                      });
                      this.loader.hideLoader(); // Hide loader *after* dawapatti data is fetched
                      this.cdr.markForCheck();
                  },
                  error: (err) => {
                      console.error('Error fetching dawapatti info:', err);
                      this.loader.hideLoader(); // Hide loader on error
                      this.cdr.markForCheck();
                  }
              });
          } else {
              this.loader.hideLoader(); // Hide loader if no requests were made
              this.cdr.markForCheck();
          }
          // ✅ --- END: NEW DAWAPATTI FETCH LOGIC ---
          
          // ❌ REMOVE the original loader.hideLoader() and cdr.markForCheck() from here, 
          //    as they are now inside the new logic block.
        },
        error: (err) => {
          console.error('❌ Error fetching parameter values:', err);
          this.alertService.alert(true, 'Failed to load existing data.');
          this.loader.hideLoader();
          this.cdr.markForCheck();
        },
      });
  }

  loadFormStructure() {
    const a_rec_adv_main_id = this.userData?.a_rec_adv_main_id;
    const m_rec_score_field_id = 8; // Main Heading ID

    this.HTTP.getData(
      `/master/get/getSubHeadingParameterByParentScoreField?a_rec_adv_main_id=${a_rec_adv_main_id}&m_rec_score_field_id=${m_rec_score_field_id}&m_rec_score_field=N`,
      'recruitement'
    ).subscribe({
      next: (headingResponse: any) => {
        const headingData = headingResponse.body?.data || [];
        if (!headingData.length) {
          console.error('❌ No heading data found.');
          this.alertService.alert(
            true,
            'Could not load form heading structure.'
          );
          return;
        }
        this.heading = headingData[0];
        this.score_field_title_name = this.heading?.score_field_title_name;
        const a_rec_adv_post_detail_id = this.heading?.a_rec_adv_post_detail_id;

        this.HTTP.getData(
          `/master/get/getSubHeadingByParentScoreField?a_rec_adv_main_id=${a_rec_adv_main_id}&score_field_parent_id=${m_rec_score_field_id}&a_rec_adv_post_detail_id=${a_rec_adv_post_detail_id}`,
          'recruitement'
        ).subscribe({
          next: (subHeadingResponse: any) => {
            const subHeadingData = subHeadingResponse.body?.data || [];

            this.subHeadings = subHeadingData.map((sub: any) => ({
              ...sub,
              items: [], // Initialize items array
            }));

            this.subHeadings.forEach((sub) => {
              const key = sub.m_rec_score_field_id.toString();
              this.subHeadingDetails[key] = [];
              this.subHeadingParameters[key] = [];
            });

            const itemRequests = this.subHeadings.map((sub) =>
              this.HTTP.getData(
                `/master/get/getSubHeadingByParentScoreField?a_rec_adv_main_id=${a_rec_adv_main_id}&score_field_parent_id=${sub.m_rec_score_field_id}&a_rec_adv_post_detail_id=${a_rec_adv_post_detail_id}`,
                'recruitement'
              )
            );

            const paramRequests = this.subHeadings.map((sub) =>
              this.HTTP.getData(
                `/master/get/getSubHeadingParameterByParentScoreField?a_rec_adv_main_id=${a_rec_adv_main_id}&m_rec_score_field_id=${sub.m_rec_score_field_id}&score_field_parent_code=${sub.score_field_parent_code}&m_parameter_master3=Y`,
                'recruitement'
              )
            );

            forkJoin([forkJoin(itemRequests), forkJoin(paramRequests)])
              .pipe(
                switchMap(([itemResponses, paramResponses]) => {
                  itemResponses.forEach((res, index) => {
                    const itemData = res.body?.data || [];
                    this.subHeadings[index].items = itemData.map(
                      (item: any) => ({
                        ...item,
                        normalizedKey: this.normalizeControlName(
                          item.score_field_name_e
                        ),
                        is_mandatory: item.score_field_is_mandatory || 'N',
                      })
                    );
                    this.setupSubHeadingForm(this.subHeadings[index]);
                  });

                  paramResponses.forEach((res, index) => {
                    const paramData =
                      res.body?.data
                        ?.map((param: any) => ({
                          ...param,
                          normalizedKey: this.normalizeControlName(
                            param.score_field_parameter_name
                          ),
                        }))
                        .sort(
                          (a: any, b: any) =>
                            (a.parameter_display_order || 0) -
                            (b.parameter_display_order || 0)
                        ) || [];
                    const subHeadingId =
                      this.subHeadings[index].m_rec_score_field_id.toString();
                    this.subHeadingParameters[subHeadingId] = paramData;
                  });

                  const allParamsWithQueries = Object.values(
                    this.subHeadingParameters
                  )
                    .flat()
                    .filter((p: any) => p.isQuery_id && p.isQuery_id > 0);

                  if (allParamsWithQueries.length === 0) {
                    return of([]); // No dropdowns to fetch
                  }

                  // 2. Create a request for each parameter, adding extra data if needed.
                  const dropdownRequests = allParamsWithQueries.map(
                    (p: any) => {
                      const extraParams: { [key: string]: any } = {};

                      // If the query is 259, add the parent ID to the payload.
                      if (p.isQuery_id === 259) {
                        extraParams['Score_Field_Parent_Id'] =
                          p.score_field_parent_id;
                      }
                      // You can add more 'else if' conditions here for other special cases.

                      // Call the updated function and map the result to include the original parameter.
                      return this.getDropdownData(
                        p.isQuery_id,
                        extraParams
                      ).pipe(map((data) => ({ parameter: p, data })));
                    }
                  );

                  return forkJoin(dropdownRequests);
                  // ✅ --- END MODIFICATION ---
                })
              )
              .subscribe({
                next: (dropdownResults: any) => {
                  // Type 'any' because it's now an array of {parameter, data}
                  // ✅ --- START MODIFICATION ---
                  // 3. Attach the fetched options directly to each parameter object.
                  if (dropdownResults && dropdownResults.length > 0) {
                    dropdownResults.forEach((result: any) => {
                      if (result && result.parameter) {
                        result.parameter.dropdownOptions = result.data;
                      }
                    });
                  }
                  // ✅ --- END MODIFICATION ---

                  this.getParameterValuesAndPatch();
                  this.cdr.detectChanges();
                },
                error: (err) => {
                  console.error(
                    '❌ Error fetching items/params/dropdowns:',
                    err
                  );
                  this.alertService.alert(true, 'Failed to load form details.');
                },
              });
          },
          error: (err) => {
            console.error('❌ Error fetching subheadings:', err);
            this.alertService.alert(true, 'Failed to load form structure.');
          },
        });
      },
      error: (err) => {
        console.error('❌ Error fetching heading:', err);
        this.alertService.alert(
          true,
          'Failed to load main form configuration.'
        );
      },
    });
  }

  setupSubHeadingForm(subHeading: any) {
    const groupName = subHeading.m_rec_score_field_id.toString();
    const subGroup: any = {};

    subHeading.items.forEach((item: any) => {
      subGroup[item.normalizedKey] = this.fb.group({
        count: [null],
      });
    });

    (this.form.get('subHeadings') as FormGroup).setControl(
      groupName,
      this.fb.group(subGroup)
    );
  }

  toggleEdit() {
    if (this.isGeneratingTable) {
      return;
    }

    this.isEditing = !this.isEditing;

    if (!this.isEditing) {
      if (this.hasCountsChanged()) {
        setTimeout(() => {
          this.generateDetailsTable();
        }, 100);
      }
    }

    this.cdr.markForCheck();
  }

  private hasCountsChanged(): boolean {
    let countsChanged = false;

    this.subHeadings.forEach((subHeading) => {
      const groupName = subHeading.m_rec_score_field_id.toString();
      const subGroup = this.form.get(['subHeadings', groupName]) as FormGroup;

      if (!subGroup) return;

      const subGroupRaw = subGroup.getRawValue() || {};

      subHeading.items.forEach((item: any) => {
        const key = item.normalizedKey;
        const control = subGroupRaw[key];
        const currentCount = control?.count ? parseInt(control.count, 10) : 0;
        const previousCount =
          this.previousCounts.get(`${groupName}_${key}`) || 0;

        if (currentCount !== previousCount) {
          countsChanged = true;
        }

        this.previousCounts.set(`${groupName}_${key}`, currentCount);
      });
    });

    return countsChanged;
  }
  public allowAlphabetsOnly(event: KeyboardEvent, param: Parameter): void {
    // Only apply this logic if the control is a text input and datatype is 'text'
    if (param.control_type === 'T' && param.isDatatype === 'text') {
      const allowedKeys = [
        'Backspace',
        'Delete',
        'Tab',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ];

      // Allow essential editing keys
      if (allowedKeys.includes(event.key)) {
        return;
      }

      // Use a regular expression to test if the key is allowed
      // This pattern allows letters, spaces, periods, and parentheses
      const isAllowedChar = /^[a-zA-Z ()]*$/.test(event.key);

      // If the key is not an allowed character, block the input
      if (!isAllowedChar) {
        event.preventDefault();
      }
    }
  }

  // In step-3.component.ts

  private createDetailGroup(
    typeValue: string,
    subHeadingId: number,
    rowIndex: number
  ): FormGroup {
    const parametersForSubHeading =
      this.getParametersForSubHeading(subHeadingId);
    const detailGroupData: DetailFormGroup = {
      type: new FormControl({ value: typeValue, disabled: true }, [
        Validators.required,
      ]),
      _rowIndex: new FormControl({ value: rowIndex, disabled: true }),
    };

    parametersForSubHeading.forEach((param: any) => {
      // ✅ START: ADDED LOGIC TO DETERMINE DISABLED STATE
      // A control is ENABLED if:
      // 1. It's for scoring but not for the candidate (isForCandidate='N' AND isForScoring='Y')
      // OR
      // 2. It is a calculation column (isCalculationColumn='Y')
      const isEnabledForScoring =
        param.isForCandidate === 'N' && param.isForScoring === 'Y';
      const isEnabledAsCalcColumn = param.isCalculationColumn === 'Y';

      const isDisabled = !isEnabledForScoring && !isEnabledAsCalcColumn;
      // ✅ END: ADDED LOGIC

      const validators = [];
      if (param.is_mandatory === 'Y') {
        validators.push(Validators.required);
      }
      if (param.control_type === 'T' && param.isDatatype === 'number') {
        validators.push(Validators.min(0));
      }
      if (param.control_type === 'T' && param.isDatatype === 'text') {
        validators.push(Validators.pattern('^[a-zA-Z ()]*$'));
      }

      // ✅ CHANGE: Use the object syntax to set the initial disabled state
      detailGroupData[param.normalizedKey] = new FormControl(
        {
          value: param.control_type === 'A' ? null : '',
          disabled: isDisabled,
        },
        validators
      );
    });

    return this.fb.group(detailGroupData);
  }

  generateDetailsTable() {
    if (this.isGeneratingTable) return;
    this.isGeneratingTable = true;

    try {
      const allGeneratedRows = new Set<AbstractControl>();

      this.subHeadings.forEach((subHeading) => {
        const groupName = subHeading.m_rec_score_field_id.toString();
        const subGroup = this.form.get(['subHeadings', groupName]) as FormGroup;
        if (!subGroup) return;

        if (!this.subHeadingDetails[groupName]) {
          this.subHeadingDetails[groupName] = [];
        }

        const subGroupRaw = subGroup.getRawValue();

        subHeading.items.forEach((item: any) => {
          const typeValue = item.m_rec_score_field_id.toString();
          const newCount =
            parseInt(subGroupRaw[item.normalizedKey]?.count, 10) || 0;

          let existingRowsOfType = this.detailsArray.controls.filter(
            (c) => c.get('type')?.value === typeValue
          );
          let oldCount = existingRowsOfType.length;

          // Add new rows if needed
          if (newCount > oldCount) {
            for (let i = 0; i < newCount - oldCount; i++) {
              // ✅ LOGIC TO FIND NEXT AVAILABLE INDEX
              const mapKey = `${subHeading.m_rec_score_field_id}_${item.m_rec_score_field_id}`;
              const newRowIndex =
                (this.highestRowIndexMap.get(mapKey) || 0) + 1;
              this.highestRowIndexMap.set(mapKey, newRowIndex); // Immediately update the new max

              const newGroup = this.createDetailGroup(
                typeValue,
                subHeading.m_rec_score_field_id,
                newRowIndex
              );
              this.detailsArray.push(newGroup);
            }
          }
          // Remove rows if needed
          else if (newCount < oldCount) {
            const toRemoveCount = oldCount - newCount;
            const rowsToRemove = existingRowsOfType.slice(-toRemoveCount);
            rowsToRemove.forEach((rowToRemove) => {
              const index = this.detailsArray.controls.indexOf(rowToRemove);
              if (index > -1) {
                this.detailsArray.removeAt(index);
              }
            });
          }
        });
      });

      // Final Sync Step: Rebuild subHeadingDetails from the single source of truth (detailsArray)
      Object.keys(this.subHeadingDetails).forEach(
        (key) => (this.subHeadingDetails[key] = [])
      );

      this.detailsArray.controls.forEach((control) => {
        const typeValue = control.get('type')?.value;
        if (typeValue) {
          const subHeading = this.subHeadings.find((sh) =>
            sh.items.some(
              (item: any) => item.m_rec_score_field_id.toString() === typeValue
            )
          );
          if (subHeading) {
            const groupName = subHeading.m_rec_score_field_id.toString();
            if (this.subHeadingDetails[groupName]) {
              this.subHeadingDetails[groupName].push(
                control as FormGroup<DetailFormGroup>
              );
            }
          }
        }
      });

      this.debugFormState();
      this.cdr.detectChanges();
    } catch (error) {
      console.error('❌ Error in generateDetailsTable:', error);
    } finally {
      this.isGeneratingTable = false;
    }
  }

  //remove this after the completion
  private debugFormState() {
    this.detailsArray.controls.forEach((control, index) => {
      const typeValue = control.get('type')?.value;
      const rawValue = control.getRawValue();
    });
  }

  // In step-3.component.ts

  onFileChange(
    event: Event,
    detailForm: AbstractControl, // <-- Changed from index
    controlName: string
  ) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    let file: File | null = input.files[0];
    const detailType = detailForm.get('type')?.value;
    const rowIndex = detailForm.get('_rowIndex')?.value; // <-- Get stable index
    let param: any = null;
    let subHeading: any = null;

    // Find the parameter configuration to access its properties
    if (detailType) {
      subHeading = this.subHeadings.find((sub) =>
        sub.items.some(
          (item: any) => item.m_rec_score_field_id.toString() === detailType
        )
      );
      if (subHeading) {
        const parameters = this.getParametersForSubHeading(
          subHeading.m_rec_score_field_id
        );
        param = parameters.find((p) => p.normalizedKey === controlName);
      }
    }

    // File size validation logic...
    if (param && param.data_type_size && file) {
      const maxSizeKB = param.data_type_size;
      const maxSizeInBytes = maxSizeKB * 1024;

      if (file.size > maxSizeInBytes) {
        this.alertService.alert(
          true,
          `File size for "${
            param.score_field_parameter_name
          }" cannot exceed ${maxSizeKB}KB. Your file is ~${Math.round(
            file.size / 1024
          )}KB.`
        );
        // If invalid, clear the input and nullify the file variable
        input.value = '';
        file = null;
      }
    }

    // Patch the new file into the form control
    detailForm.patchValue({ [controlName]: file }, { emitEvent: false });

    // If a user selects a new file, we must delete the old file path from memory.
    if (detailType && param && subHeading && rowIndex) {
      const paramKey = `${subHeading.m_rec_score_field_id}_${detailType}_${param.m_rec_score_field_parameter_new_id}_${rowIndex}`;
      if (this.filePaths.has(paramKey)) {
        this.filePaths.delete(paramKey);
      }
    }

    this.cdr.markForCheck();
  }

  private logFormData(title: string, formData: FormData) {
    for (const [key, value] of formData.entries()) {
      if (
        key === 'scoreFieldDetailList' ||
        key === 'scoreFieldParameterList' ||
        key === 'parentScore'
      ) {
        try {
          const parsedValue = JSON.parse(value as string);
        } catch (e) {}
      } else if (key.startsWith('file_')) {
      } else {
      }
    }
  }

  private logExistingIds() {}

  private generateFilePath(
    registrationNo: number,
    file: File,
    scoreFieldId: number,
    parameterId: number,
    rowIndex: number,
    subHeadingId: number
  ): string {
    const originalName = file.name;
    // Use path.parse to correctly separate the name and extension
    const parsedFile = {
      name: originalName.substring(0, originalName.lastIndexOf('.')),
      ext: originalName.substring(originalName.lastIndexOf('.')),
    };

    const sanitizedName = parsedFile.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Append the original extension at the end
    const fileName = `${registrationNo}_${subHeadingId}_${scoreFieldId}_${parameterId}_${rowIndex}_${sanitizedName}${parsedFile.ext}`;

    return `recruitment/${registrationNo}/${fileName}`;
  }

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.checkMandatorySubheadingsAndParameters();

    // Emit the latest form data and validity state
    const formData = this.getFormData();
    this.formData.emit(formData);

    if (!formData._isValid) {
      const firstMissed = this.form.get('firstMissedMandatory')?.value;
      this.alertService.alert(
        true,
        firstMissed
          ? `${firstMissed} is mandatory. Please provide the required information.`
          : 'Please fill all mandatory fields.'
      );
      // ✅ Reject the promise to signal failure to the stepper
      return Promise.reject(new Error('Form is invalid'));
    }

    const anySelected = this.detailsArray.length > 0;
    if (anySelected) {
      // ✅ Await the database save operation, which includes waiting for the success alert
      await this.saveToDatabase();
    } else {
      // If nothing is selected, resolve immediately as there's nothing to save.
      console.log('No items were selected, so nothing was saved.');
      return Promise.resolve();
    }
  }

  // Helper method to prepare form data for emission (optional, to avoid duplication)
  private getFormData(): any {
    // Get the full raw value of the form, including the _rowIndex
    const formValue = this.form.getRawValue();

    // ✅ Create a new 'details' array that excludes the '_rowIndex' from each object
    const detailsWithoutRowIndex = formValue.details.map((detail: any) => {
      const { _rowIndex, ...rest } = detail; // Use destructuring to separate _rowIndex
      return rest; // Return only the remaining properties
    });

    const subheadingsData = this.subHeadings.reduce((acc, sub) => {
      acc[sub.m_rec_score_field_id] = {
        m_rec_score_field_id: sub.m_rec_score_field_id,
        score_field_name_e: sub.score_field_name_e,
        a_rec_adv_post_detail_id: sub.a_rec_adv_post_detail_id,
        items: sub.items.map((item: any) => ({
          m_rec_score_field_id: item.m_rec_score_field_id,
          score_field_name_e: item.score_field_name_e,
          normalizedKey: item.normalizedKey,
        })),
      };
      return acc;
    }, {} as { [key: string]: any });

    // Construct the final object for emission
    return {
      ...formValue, // Spread the original to get other form data
      details: detailsWithoutRowIndex, // Overwrite the 'details' property with our cleaned version
      _isValid: this.form.valid,
      heading: {
        score_field_title_name: this.score_field_title_name,
        m_rec_score_field_id: 8,
        a_rec_adv_post_detail_id: this.heading?.a_rec_adv_post_detail_id,
      },
      subheadings: subheadingsData,
    };
  }

  // in step-3.component.ts

  saveToDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.loader.showLoader();
      const registrationNo = this.userData?.registration_no;
      const a_rec_adv_main_id = this.userData?.a_rec_adv_main_id;
      const a_rec_app_main_id = this.userData?.a_rec_app_main_id;
      if (!registrationNo || !a_rec_adv_main_id || !a_rec_app_main_id) {
        const errorMsg = 'User identification is missing. Cannot save data.';
        this.alertService.alert(true, errorMsg);
        this.loader.hideLoader();
        return reject(new Error(errorMsg));
      }
      const formData = new FormData();
      const finalDetailList: any[] = [];
      const finalParameterList: any[] = [];
      let parentCalculatedValue = 0; // STEP 1: Create Summary Detail Records

      const rowsGroupedByType = new Map<string, any[]>();
      this.detailsArray.controls.forEach((control) => {
        const typeValue = control.get('type')?.value;
        if (typeValue) {
          if (!rowsGroupedByType.has(typeValue)) {
            rowsGroupedByType.set(typeValue, []);
          }
          rowsGroupedByType.get(typeValue)!.push(control);
        }
      });

      rowsGroupedByType.forEach((rowControls, typeValue) => {
        const scoreFieldId = Number(typeValue);
        const subHeading = this.subHeadings.find((sub) =>
          sub.items.some(
            (item: any) => item.m_rec_score_field_id === scoreFieldId
          )
        );
        if (!subHeading) return;

        const subHeadingId = subHeading.m_rec_score_field_id;
        const item = subHeading.items.find(
          (i: any) => i.m_rec_score_field_id === scoreFieldId
        )!;
        const subHeadingParameters =
          this.subHeadingParameters[subHeadingId.toString()] || [];
        const statusParam = subHeadingParameters.find(
          (p) => p.m_parameter_master_id === 3
        );
        const remarkParam = subHeadingParameters.find(
          (p) => p.m_parameter_master_id === 4
        );
        const totalCount = rowControls.length;
        let validRowCount = totalCount;
        const allStatuses = statusParam
          ? rowControls.map((rc) => rc.getRawValue()[statusParam.normalizedKey])
          : [];

        if (statusParam) {
          validRowCount = allStatuses.filter((status) => status != 2).length;
        }

        let scoreResult;
        let summaryStatusId: number | null = null;
        let summaryRemarkId: number | null = null; // ⭐ MODIFICATION: This now correctly represents the number of non-rejected rows.
        let finalScoreFieldValue = validRowCount;

        if (statusParam && validRowCount === 0 && totalCount > 0) {
          scoreResult = {
            score_field_value: 0,
            score_field_actual_value: 0,
            score_field_calculated_value: 0,
          };
          summaryStatusId = 2; // Rejected
          if (remarkParam) {
            const firstRejectedRow = rowControls[0];
            summaryRemarkId =
              firstRejectedRow.getRawValue()[remarkParam.normalizedKey] || null;
          }
        } else {
          scoreResult = this.utils.calculateScore(
            3,
            {
              quantityInputs: [
                {
                  scoreFieldId: item.m_rec_score_field_id,
                  quantity: validRowCount,
                  weightage: item.score_field_field_weightage || 0,
                  scoreFieldMarks: item.score_field_field_marks || 0,
                },
              ],
            },
            item.score_field_field_marks || 0
          );

          const hasVerified = allStatuses.some((s) => s == 1);
          if (hasVerified) {
            summaryStatusId = 1;
          }
        }

        const detailKey = `${subHeadingId}_${scoreFieldId}`;
        const existingDetailId = this.existingDetailIds.get(detailKey);
        const detailRecord = {
          ...(existingDetailId && {
            a_rec_app_score_field_detail_id: existingDetailId,
          }),
          registration_no: registrationNo,
          a_rec_app_main_id: a_rec_app_main_id,
          a_rec_adv_post_detail_id: subHeading.a_rec_adv_post_detail_id,
          score_field_parent_id: subHeadingId,
          m_rec_score_field_id: scoreFieldId,
          m_rec_score_field_method_id: 3,
          score_field_value: finalScoreFieldValue, // Use the final calculated value
          score_field_actual_value: scoreResult.score_field_actual_value,
          score_field_calculated_value:
            scoreResult.score_field_calculated_value,
          field_marks: item.score_field_field_marks || 0,
          field_weightage: item.score_field_field_weightage || 0,
          Document_Status_Flag_Id: summaryStatusId,
          Document_Status_Remark_Id: summaryRemarkId,
          verify_remark: 'Not Verified',
          active_status: 'Y',
          delete_flag: 'N',
          action_type: existingDetailId ? 'U' : 'E',
          action_date: new Date().toISOString(),
          action_remark: existingDetailId ? 'data updated' : 'data inserted',
          action_by: 1,
        };
        finalDetailList.push(detailRecord);
        parentCalculatedValue += detailRecord.score_field_calculated_value;
      }); // STEP 2: Create Granular Parameter Records for each UI row

      this.detailsArray.controls.forEach((rowControl) => {
        const typeValue = rowControl.get('type')?.value;
        if (!typeValue) return;

        const scoreFieldId = Number(typeValue);
        const subHeading = this.subHeadings.find((sub) =>
          sub.items.some(
            (item: any) => item.m_rec_score_field_id === scoreFieldId
          )
        );
        if (!subHeading) return;

        const subHeadingId = subHeading.m_rec_score_field_id;
        const detailKey = `${subHeadingId}_${scoreFieldId}`;
        const detailRecordFk = this.existingDetailIds.get(detailKey);
        const rowIndex = rowControl.get('_rowIndex')?.value;
        if (rowIndex === null || rowIndex === undefined) {
          return;
        }

        const subHeadingParameters =
          this.subHeadingParameters[subHeadingId.toString()] || [];
        const rowValues = rowControl.getRawValue();
        let documentStatusFlagId: number | null = null;
        let documentStatusRemarkId: number | null = null;
        const statusParam = subHeadingParameters.find(
          (p) => p.m_parameter_master_id === 3
        );
        const remarkParam = subHeadingParameters.find(
          (p) => p.m_parameter_master_id === 4
        );
        if (statusParam) {
          documentStatusFlagId = rowValues[statusParam.normalizedKey] || null;
        }
        if (remarkParam) {
          documentStatusRemarkId = rowValues[remarkParam.normalizedKey] || null;
        }

        subHeadingParameters.forEach((param: any) => {
          const paramValue = rowControl.getRawValue()[param.normalizedKey];
          const isFile = paramValue instanceof File;
          const paramKey = `${subHeadingId}_${scoreFieldId}_${param.m_rec_score_field_parameter_new_id}_${rowIndex}`;
          const existingParamId = this.existingParameterIds.get(paramKey);
          const existingFilePath = this.filePaths.get(paramKey);

          if (paramValue || existingParamId) {
            const parameter = {
              ...(existingParamId && {
                a_rec_app_score_field_parameter_detail_id: existingParamId,
              }),
              ...(detailRecordFk && {
                a_rec_app_score_field_detail_id: detailRecordFk,
              }),
              registration_no: registrationNo,
              score_field_parent_id: subHeadingId,
              m_rec_score_field_id: scoreFieldId,
              m_rec_score_field_parameter_new_id:
                param.m_rec_score_field_parameter_new_id,
              parameter_value: isFile
                ? this.generateFilePath(
                    registrationNo,
                    paramValue,
                    scoreFieldId,
                    param.m_rec_score_field_parameter_new_id,
                    rowIndex,
                    subHeadingId
                  )
                : paramValue === 'FILE_UPLOADED' && existingFilePath
                ? existingFilePath
                : String(paramValue ?? ''),
              parameter_row_index: rowIndex,
              parameter_display_order: param.parameter_display_order || 0,
              verify_remark: 'Not Verified',
              active_status: 'Y',
              delete_flag: 'N',
              action_type: existingParamId ? 'U' : 'E',
              action_date: new Date().toISOString(),
              action_remark: existingParamId
                ? 'parameter updated'
                : 'parameter inserted',
              action_by: 1,
              Document_Status_Flag_Id: documentStatusFlagId,
              Document_Status_Remark_Id: documentStatusRemarkId,
            };
            finalParameterList.push(parameter);
            if (isFile) {
              const fileControlName = `file_${subHeadingId}_${scoreFieldId}_${
                param.m_rec_score_field_parameter_new_id
              }_${param.parameter_display_order || 0}_${rowIndex}`;
              formData.append(fileControlName, paramValue, paramValue.name);
            }
          }
        });
      }); // STEP 3: Append the list of parameter IDs to be DELETED.

      if (this.parameterIdsToDelete.length > 0) {
        formData.append(
          'parameterIdsToDelete',
          JSON.stringify(this.parameterIdsToDelete)
        );
      } // STEP 4: Create the Parent Record

      const parentRecord = this.createParentRecord(
        registrationNo,
        a_rec_app_main_id,
        parentCalculatedValue
      );
      if (parentRecord) {
        formData.append('parentScore', JSON.stringify(parentRecord));
      } // STEP 5 & 6: Append final lists and make the API call

      formData.append('registration_no', registrationNo.toString());
      formData.append('scoreFieldDetailList', JSON.stringify(finalDetailList));
      formData.append(
        'scoreFieldParameterList',
        JSON.stringify(finalParameterList)
      );
      this.HTTP.postForm(
        '/candidate/postFile/saveOrUpdateQuantityBasedCandidateDetailsForScoring',
        formData,
        'recruitement'
      ).subscribe({
        next: async (res) => {
          if (res?.body?.error) {
            this.alertService.alert(
              true,
              res.body.error.message || 'An error occurred on the server.'
            );
            this.loader.hideLoader();
            reject(new Error(res.body.error.message));
            return;
          }
          this.loader.hideLoader();
          await this.alertService.alert(false, 'Data saved successfully!');
          this.parameterIdsToDelete = [];
          this.getParameterValuesAndPatch();
          this.cdr.markForCheck();
          resolve();
        },
        error: (err) => {
          this.alertService.alert(
            true,
            'Error saving records: ' + (err.error?.message || err.message)
          );
          this.cdr.markForCheck();
          this.loader.hideLoader();
          reject(err);
        },
      });
    });
  }

  // You might need a helper function for the parent record to avoid duplicating code
  private createParentRecord(
    registrationNo: number,
    a_rec_app_main_id: number,
    parentCalculatedValue: number // This value is now passed in
  ): any {
    if (!this.heading) return null; // ⭐ MODIFICATION: Removed the internal recalculation logic. // The parent score is now derived from the sum of its children's scores.

    const parentMaxMarks = this.heading.score_field_field_marks || 20;

    return {
      ...(this.existingParentDetailId && {
        a_rec_app_score_field_detail_id: this.existingParentDetailId,
      }),
      registration_no: registrationNo,
      a_rec_app_main_id: a_rec_app_main_id,
      a_rec_adv_post_detail_id: this.heading.a_rec_adv_post_detail_id,
      score_field_parent_id: 0,
      m_rec_score_field_id: this.heading.m_rec_score_field_id,
      m_rec_score_field_method_id: 3,
      score_field_value: parentMaxMarks, // The parent's "value" can be considered its max potential marks
      score_field_actual_value: parentCalculatedValue,
      score_field_calculated_value: Math.min(
        parentCalculatedValue,
        parentMaxMarks
      ), // Cap the final score at the maximum allowed
      field_marks: parentMaxMarks,
      field_weightage: this.heading.score_field_field_weightage || 0,
      verify_remark: 'Not Verified',
      action_type: 'U',
      action_date: new Date().toISOString(),
      action_remark: 'parent data updated from recruitment form',
      action_by: 1,
      delete_flag: 'N',
    };
  }
}
<section class="relative rounded-xl min-h-[200px]">
  <div class="relative bg-white/90 backdrop-blur-sm rounded-xl">
    <form [formGroup]="form" (ngSubmit)="submit()">
      <div
        *ngIf="
          form.get('mandatorySubheadingsSelected')?.invalid &&
          form.get('mandatorySubheadingsSelected')?.touched
        "
        class="text-red-600 text-xs mt-1 p-2 bg-red-50 border border-red-200 rounded-md"
      >
        <div *ngIf="form.get('firstMissedMandatory')?.value">
          <strong>Mandatory Field Required:</strong>
          {{ form.get("firstMissedMandatory")?.value }} must be provided.
        </div>
      </div>

      <h5
        class="text-2xl font-bold text-indigo-900 mb-8 flex items-center gap-2"
      >
        <svg
          class="w-6 h-6 text-indigo-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
          />
        </svg>
        {{ score_field_title_name }}
      </h5>

      <ng-container *ngFor="let subHeading of subHeadings">
        <div
          class="mt-3"
          *ngIf="hasSubHeadingRows(subHeading.m_rec_score_field_id)"
        >
          <h6
            class="text-xl font-semibold text-indigo-900 mb-1 flex items-center gap-1"
          >
            <svg
              class="w-5 h-5 text-indigo-700"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {{ subHeading.score_field_name_e }}
          </h6>
          <div class="overflow-x-auto">
            <table
              class="w-full bg-white rounded-md border border-gray-100 shadow-sm table-auto"
            >
              <thead class="bg-indigo-700 text-white">
                <tr>
                  <th
                    class="px-1 py-1 text-left text-xs font-medium tracking-wide"
                  >
                    S.No.
                  </th>

                  <th
                    class="px-1 py-1 text-left text-xs font-medium tracking-wide"
                  >
                    Item Name
                  </th>

                  <th
                    *ngFor="
                      let param of getParametersForSubHeading(
                        subHeading.m_rec_score_field_id
                      )
                    "
                    class="px-1 py-2 text-left text-xs font-medium tracking-wide"
                  >
                    {{ param.score_field_parameter_name }}
                    <span
                      *ngIf="param.is_mandatory === 'Y'"
                      class="text-red-200"
                      >*</span
                    >
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <ng-container
                  *ngFor="
                    let detailForm of getRowsForSubHeading(
                      subHeading.m_rec_score_field_id
                    );
                    let i = index
                  "
                >
                  <tr
                    [formGroup]="detailForm"
                    class="transition border-l-4"
                    [ngClass]="{
                      'bg-green-200 border-l-green-600':
                        getRowVerificationStatus(detailForm) == '1' ||
                        getRowVerificationStatus(detailForm) == '8',
                      'bg-red-200 border-l-red-600':
                        getRowVerificationStatus(detailForm) == '2',
                      'bg-white border-l-gray-200':
                        getRowVerificationStatus(detailForm) != '1' &&
                        getRowVerificationStatus(detailForm) != '8' &&
                        getRowVerificationStatus(detailForm) != '2'
                    }"
                  >
                    <td class="px-4 py-1 text-base font-medium text-gray-600">
                      {{ i + 1 }}
                    </td>
                    <td class="px-4 py-1 text-base">
                      <input
                        type="text"
                        class="w-full border border-gray-200 rounded-md px-2 py-1 text-base bg-indigo-50 text-gray-600 cursor-not-allowed"
                        [value]="getCheckboxName(detailForm)"
                        readonly
                      />
                    </td>

                    <td
                      *ngFor="
                        let param of getParametersForSubHeading(
                          subHeading.m_rec_score_field_id
                        )
                      "
                      class="px-4 py-1 text-base"
                    >
                      <ng-container [ngSwitch]="param.control_type">
                        <ng-container *ngSwitchCase="'A'">
                          <div>
                            <ng-container
                              *ngIf="
                                getFilePath(
                                  detailForm,
                                  param.m_rec_score_field_parameter_new_id,
                                  subHeading.m_rec_score_field_id
                                ) as filePath;
                                else fileNotUploaded
                              "
                            >
                              <a
                                [href]="sanitizeFileUrl(filePath)"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-xs !text-green-600 hover:underline flex items-center mt-1"
                              >
                                <svg
                                  class="h-4 w-4 mr-1"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                  />
                                </svg>
                                View Uploaded File
                              </a>
                            </ng-container>
                            <ng-template #fileNotUploaded>
                              <span class="text-xs text-red-600 mt-1 block"
                                >File not uploaded</span
                              >
                            </ng-template>
                          </div>
                        </ng-container>

                        <textarea
                          *ngSwitchCase="'TR'"
                          [formControlName]="param.normalizedKey"
                          [placeholder]="
                            'Enter ' + param.score_field_parameter_name
                          "
                          rows="3"
                          class="w-full border border-gray-200 rounded-md px-2 py-1 text-base focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
                        ></textarea>
                        <select
                          *ngSwitchCase="'DC'"
                          [formControlName]="param.normalizedKey"
                          class="w-full border border-gray-200 rounded-md px-2 py-1 text-base focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                          <option value="">
                            Select {{ param.score_field_parameter_name }}
                          </option>

                          <option
                            *ngFor="let option of param.dropdownOptions"
                            [value]="option.data_id"
                          >
                            {{ option.data_name }}
                          </option>
                        </select>
                        <select
                          *ngSwitchCase="'D'"
                          [formControlName]="param.normalizedKey"
                          class="w-full border border-gray-200 rounded-md px-2 py-1 text-base focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
                        >
                          <option value="">
                            Select {{ param.score_field_parameter_name }}
                          </option>

                          <option
                            *ngFor="let option of param.dropdownOptions"
                            [value]="option.data_id"
                          >
                            {{ option.data_name }}
                          </option>
                        </select>
                        <select
                          *ngSwitchCase="'DY'"
                          class="w-full border border-gray-200 rounded-md px-2 py-1 text-base focus:ring-1 focus:ring-gray-400 focus:border-gray-400 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
                          [formControlName]="param.normalizedKey"
                        >
                          <option value="">
                            Select {{ param.score_field_parameter_name }}
                          </option>

                          <option
                            *ngFor="let option of param.dropdownOptions"
                            [value]="option.data_id"
                          >
                            {{ option.data_name }}
                          </option>
                        </select>

                        <input
                          *ngSwitchDefault
                          [type]="
                            param.isDatatype === 'number' ? 'number' : 'text'
                          "
                          class="w-full border border-gray-200 rounded-md px-2 py-1 text-base focus:ring-1 focus:ring-gray-400 focus:border-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-500"
                          [formControlName]="param.normalizedKey"
                          [placeholder]="param.score_field_parameter_name"
                          [attr.min]="param.isDatatype === 'number' ? 0 : null"
                          [attr.pattern]="
                            param.control_type === 'T' &&
                            param.isDatatype === 'text'
                              ? '^[a-zA-Z ()]*$'
                              : null
                          "
                          (keydown)="allowAlphabetsOnly($event, param)"
                        />
                      </ng-container>

                      <div
                        *ngIf="
                          detailForm.get(param.normalizedKey)?.touched &&
                          detailForm.get(param.normalizedKey)?.invalid
                        "
                        class="text-red-600 text-xs mt-1"
                      >
                        <div
                          *ngIf="
                            detailForm
                              .get(param.normalizedKey)
                              ?.hasError('required')
                          "
                        >
                          {{ param.score_field_parameter_name }} is required.
                        </div>

                        <div
                          *ngIf="
                            detailForm
                              .get(param.normalizedKey)
                              ?.hasError('pattern')
                          "
                        >
                          Only letters and () are allowed.
                        </div>

                        <div
                          *ngIf="
                            detailForm.get(param.normalizedKey)?.hasError('min')
                          "
                        >
                          Value cannot be negative.
                        </div>
                      </div>
                    </td>
                  </tr>

                  <tr
                    *ngIf="getDawapattiForRow(detailForm) as dawapatti"
                    class="bg-yellow-50 border-l-4 border-l-yellow-400"
                  >
                    <td
                      class="px-4 py-2 text-sm"
                      [colSpan]="
                        getParametersForSubHeading(
                          subHeading.m_rec_score_field_id
                        ).length + 2
                      "
                    >
                      <div
                        class="flex items-start gap-4 p-2 bg-yellow-100 rounded-md border border-yellow-300"
                      >
                        <svg
                          class="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        <div class="flex flex-wrap items-center gap-2 text-sm">
                          <strong class="text-yellow-900 whitespace-nowrap">
                            Dawapatti (Objection) Filed:
                          </strong>

                          <span
                            *ngIf="dawapatti.remark"
                            class="text-yellow-800 italic truncate max-w-[250px]"
                          >
                            "{{ dawapatti.remark }}"
                          </span>

                          <ng-container
                            *ngIf="dawapatti.document as docPath; else noDoc"
                          >
                            <a
                              [href]="sanitizeFileUrl(docPath)"
                              target="_blank"
                              rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 px-2 py-1 bg-yellow-600 text-white text-xs font-medium rounded hover:bg-yellow-700 transition"
                            >
                              <svg
                                class="w-3.5 h-3.5"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                              >
                                <path
                                  fill-rule="evenodd"
                                  d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243L15.75 8.5h-1.5L7.125 15.625a.75.75 0 01-1.06-1.06L13.19 7.44a.75.75 0 011.06 0l.07.071.071-.07a.75.75 0 011.06 0l.07.07.071-.07a.75.75 0 011.06 0l.707.708a.75.75 0 010 1.06l-6.125 6.125a.75.75 0 01-1.06 0l-1.061-1.06a.75.75 0 010-1.061l4.5-4.5a.75.75 0 011.06 0l.708.707a.75.75 0 010 1.06L11.75 13H13l4.379-4.379a3 3 0 000-4.242z"
                                  clip-rule="evenodd"
                                />
                              </svg>
                              View
                            </a>
                          </ng-container>

                          <ng-template #noDoc>
                            <span class="text-xs text-yellow-700"
                              >(No document attached)</span
                            >
                          </ng-template>
                        </div>
                      </div>
                    </td>
                  </tr>
                </ng-container>
              </tbody>
            </table>
          </div>
        </div>
      </ng-container>
    </form>
  </div>
</section>
here we have to shwo scoring by commitee , scoring as per filled form and max/ marks and obtained marks I am sharing you the apis http://192.168.1.57:3500/recruitementApi/master/get/getSubHeadingParameterByParentScoreField?a_rec_adv_main_id=120&m_rec_score_field_id=8&a_rec_adv_post_detail_id=254 {
  "error": null,
  "data": [
    {
      "a_rec_adv_post_score_detail_id": 2402,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 8,
      "score_field_parent_id": 0,
      "score_field_title_name": "Academic Excellence",
      "score_field_display_no": 2
    }
  ]
} http://192.168.1.57:3500/recruitementApi/master/get/getSubHeadingByParentScoreField?a_rec_adv_main_id=120&score_field_parent_id=8&a_rec_adv_post_detail_id=254 {
  "error": null,
  "data": [
    {
      "m_rec_score_field_id": 3088,
      "score_field_parent_code": 8,
      "score_field_name_e": "University medal at UG/PG/Ph.D",
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_flag": null,
      "message": null,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 8,
      "m_rec_score_field_method_id": 3,
      "score_field_field_marks": 3,
      "score_field_field_weightage": 0,
      "score_field_validation_marks": 0,
      "score_field_display_no": 1,
      "score_field_is_attachment_required": "1",
      "score_field_is_mandatory": "0",
      "score_field_no_of_rows": 0
    },
    {
      "m_rec_score_field_id": 3092,
      "score_field_parent_code": 8,
      "score_field_name_e": "JRF/SRF of ICAR/CSIR/GATE/UGC etc. obtained through any examination/competition will only be considered",
      "score_field_title_name": "JRF/SRF of ICAR/CSIR/GATE/UGC etc. obtained through any examination/competition will only be considered",
      "score_field_flag": null,
      "message": "Select ",
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 8,
      "m_rec_score_field_method_id": 3,
      "score_field_field_marks": 2,
      "score_field_field_weightage": 0,
      "score_field_validation_marks": 0,
      "score_field_display_no": 2,
      "score_field_is_attachment_required": "1",
      "score_field_is_mandatory": "0",
      "score_field_no_of_rows": 0
    }
  ]
} http://192.168.1.57:3500/recruitementApi/master/get/getSubHeadingByParentScoreField?a_rec_adv_main_id=120&score_field_parent_id=3088&a_rec_adv_post_detail_id=254 {
  "error": null,
  "data": [
    {
      "m_rec_score_field_id": 3089,
      "score_field_parent_code": 3088,
      "score_field_name_e": "Gold Medal ",
      "score_field_title_name": "Gold Medal",
      "score_field_flag": null,
      "message": "Select No. of Gold Medal Received",
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 3088,
      "m_rec_score_field_method_id": 3,
      "score_field_field_marks": 2,
      "score_field_field_weightage": 1,
      "score_field_validation_marks": 0,
      "score_field_display_no": 1,
      "score_field_is_attachment_required": "1",
      "score_field_is_mandatory": "1",
      "score_field_no_of_rows": 0
    },
    {
      "m_rec_score_field_id": 3090,
      "score_field_parent_code": 3088,
      "score_field_name_e": "Silver Medal",
      "score_field_title_name": "Silver Medal",
      "score_field_flag": null,
      "message": "Select No. of Silver Medal Received",
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 3088,
      "m_rec_score_field_method_id": 3,
      "score_field_field_marks": 1,
      "score_field_field_weightage": 1,
      "score_field_validation_marks": 0,
      "score_field_display_no": 2,
      "score_field_is_attachment_required": "1",
      "score_field_is_mandatory": "0",
      "score_field_no_of_rows": 0
    },
    {
      "m_rec_score_field_id": 3091,
      "score_field_parent_code": 3088,
      "score_field_name_e": "Bronze Medal",
      "score_field_title_name": "Bronze Medal",
      "score_field_flag": null,
      "message": "Select No. of Bronze Medal Received",
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 3088,
      "m_rec_score_field_method_id": 3,
      "score_field_field_marks": 1,
      "score_field_field_weightage": 1,
      "score_field_validation_marks": 0,
      "score_field_display_no": 3,
      "score_field_is_attachment_required": "1",
      "score_field_is_mandatory": "0",
      "score_field_no_of_rows": 0
    }
  ]
} http://192.168.1.57:3500/recruitementApi/master/get/getSubHeadingParameterByParentScoreField?a_rec_adv_main_id=120&m_rec_score_field_id=3088&score_field_parent_code=8&m_parameter_master3=Y {
  "error": null,
  "data": [
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Degree",
      "isForCandidate": "Y",
      "isForScreening": "Y",
      "isForScoring": "Y",
      "m_datatype_master_id": 1,
      "datatype_name": "Text (Only Text)",
      "isDatatype": "text",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "DC",
      "m_rec_score_field_parameter_new_id": 1178,
      "isQuery_id": 86,
      "is_mandatory": "N",
      "parameter_display_order": 1,
      "m_parameter_master_id": 8
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Description (If any)",
      "isForCandidate": "Y",
      "isForScreening": "Y",
      "isForScoring": "Y",
      "m_datatype_master_id": 1,
      "datatype_name": "Text (Only Text)",
      "isDatatype": "text",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "T",
      "m_rec_score_field_parameter_new_id": 1179,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 2,
      "m_parameter_master_id": 9
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Attachment (Certificate)",
      "isForCandidate": "Y",
      "isForScreening": "Y",
      "isForScoring": "Y",
      "m_datatype_master_id": 13,
      "datatype_name": "Pdf File (200Kb)",
      "isDatatype": "file",
      "data_type_size": 200,
      "isCalculationColumn": "N",
      "control_type": "A",
      "m_rec_score_field_parameter_new_id": 1180,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 3,
      "m_parameter_master_id": 47
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Scoring Status",
      "isForCandidate": "N",
      "isForScreening": "N",
      "isForScoring": "Y",
      "m_datatype_master_id": 6,
      "datatype_name": "Drop Down",
      "isDatatype": "select",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "DV",
      "m_rec_score_field_parameter_new_id": 1181,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 4,
      "m_parameter_master_id": 3
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Scoring Remark",
      "isForCandidate": "N",
      "isForScreening": "N",
      "isForScoring": "Y",
      "m_datatype_master_id": 3,
      "datatype_name": "Text Area",
      "isDatatype": "text_all",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "T",
      "m_rec_score_field_parameter_new_id": 1182,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 5,
      "m_parameter_master_id": 4
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Scoring as per filled form",
      "isForCandidate": "N",
      "isForScreening": "N",
      "isForScoring": "Y",
      "m_datatype_master_id": 1,
      "datatype_name": "Text (Only Text)",
      "isDatatype": "text",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "T",
      "m_rec_score_field_parameter_new_id": 1183,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 6,
      "m_parameter_master_id": 5
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Scoring by committee",
      "isForCandidate": "N",
      "isForScreening": "N",
      "isForScoring": "Y",
      "m_datatype_master_id": 1,
      "datatype_name": "Text (Only Text)",
      "isDatatype": "text",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "T",
      "m_rec_score_field_parameter_new_id": 1184,
      "isQuery_id": 0,
      "is_mandatory": "N",
      "parameter_display_order": 7,
      "m_parameter_master_id": 6
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Verify Status",
      "isForCandidate": "N",
      "isForScreening": "Y",
      "isForScoring": "Y",
      "m_datatype_master_id": 6,
      "datatype_name": "Drop Down",
      "isDatatype": "select",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "D",
      "m_rec_score_field_parameter_new_id": 1187,
      "isQuery_id": 258,
      "is_mandatory": "N",
      "parameter_display_order": 8,
      "m_parameter_master_id": 68
    },
    {
      "a_rec_adv_post_score_detail_id": 2403,
      "a_rec_adv_main_id": 120,
      "a_rec_adv_post_detail_id": 254,
      "m_rec_score_field_id": 3088,
      "score_field_parent_id": 8,
      "score_field_title_name": "University medal at UG/PG/Ph.D",
      "score_field_display_no": 1,
      "score_field_parameter_name": "Verify Remark",
      "isForCandidate": "N",
      "isForScreening": "Y",
      "isForScoring": "Y",
      "m_datatype_master_id": 6,
      "datatype_name": "Drop Down",
      "isDatatype": "select",
      "data_type_size": null,
      "isCalculationColumn": "N",
      "control_type": "D",
      "m_rec_score_field_parameter_new_id": 1188,
      "isQuery_id": 259,
      "is_mandatory": "N",
      "parameter_display_order": 9,
      "m_parameter_master_id": 69
    }
  ]
} http://192.168.1.57:3500/recruitementApi/candidate/get/getParameterValues?registration_no=25000002&a_rec_app_main_id=12&score_field_parent_id=1&m_rec_score_field_id=3&Application_Step_Flag_CES=E {
  "error": null,
  "data": [
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3667,
      "m_rec_score_field_parameter_new_id": 1079,
      "parameter_value": "khjk",
      "is_active": "Y",
      "parameter_display_no": 1,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3667
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3668,
      "m_rec_score_field_parameter_new_id": 1080,
      "parameter_value": "jhkhjk",
      "is_active": "Y",
      "parameter_display_no": 2,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3668
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3669,
      "m_rec_score_field_parameter_new_id": 1081,
      "parameter_value": "hjkjhkhj",
      "is_active": "Y",
      "parameter_display_no": 3,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3669
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3670,
      "m_rec_score_field_parameter_new_id": 1082,
      "parameter_value": "2",
      "is_active": "Y",
      "parameter_display_no": 4,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3670
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3671,
      "m_rec_score_field_parameter_new_id": 1083,
      "parameter_value": "49",
      "is_active": "Y",
      "parameter_display_no": 5,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3671
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3672,
      "m_rec_score_field_parameter_new_id": 1084,
      "parameter_value": "87",
      "is_active": "Y",
      "parameter_display_no": 6,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3672
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3673,
      "m_rec_score_field_parameter_new_id": 1085,
      "parameter_value": "8",
      "is_active": "Y",
      "parameter_display_no": 7,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3673
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3674,
      "m_rec_score_field_parameter_new_id": 1087,
      "parameter_value": "recruitment/25000002/25000002_1_3_1087_1_Bhupesh_Resume.pdf",
      "is_active": "Y",
      "parameter_display_no": 9,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3674
    },
    {
      "a_rec_app_score_field_detail_id": 695,
      "registration_no": 25000002,
      "a_rec_app_main_id": 12,
      "a_rec_adv_post_detail_id": 254,
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "Application_Step_Flag_CES": "E",
      "score_field_value": 0,
      "score_field_actual_value": 0,
      "score_field_calculated_value": 0,
      "m_rec_score_field_method_id": 1,
      "field_marks": 20,
      "field_weightage": 2,
      "remark": null,
      "a_rec_app_score_field_parameter_detail_id": 3675,
      "m_rec_score_field_parameter_new_id": 1191,
      "parameter_value": "2",
      "is_active": "Y",
      "parameter_display_no": 11,
      "obt_marks": 0,
      "unique_parameter_display_no": null,
      "parameter_row_index": 1,
      "parameter_sequence_id": 3675
    }
  ]
} http://192.168.1.57:3500/recruitementApi/candidate/get/getCandidateReportCard?Flag_CES=E&registration_no=25000002&app_main_id=12 {
  "error": null,
  "data": [
    {
      "item_type": "Obtained Marks",
      "score_field_parent_id": 0,
      "m_rec_score_field_id": 8,
      "section_name": "Academic Excellence",
      "item_name": "Academic Excellence",
      "score_field_calculated_value": 2,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 703
    },
    {
      "item_type": "Obtained Marks",
      "score_field_parent_id": 0,
      "m_rec_score_field_id": 1,
      "section_name": "Educational Qualification",
      "item_name": "Educational Qualification",
      "score_field_calculated_value": 26.2,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 709
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 4,
      "section_name": "Educational Qualification",
      "item_name": "Master Degree",
      "score_field_calculated_value": 0,
      "Document_Status_Flag_Id": 2,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 712
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 3,
      "section_name": "Educational Qualification",
      "item_name": "Bachelor Degree",
      "score_field_calculated_value": 17.4,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 711
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 1,
      "m_rec_score_field_id": 2,
      "section_name": "Educational Qualification",
      "item_name": "10+2/HSSC/(old 11th Board)",
      "score_field_calculated_value": 8.8,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 710
    },
    {
      "item_type": "Obtained Marks",
      "score_field_parent_id": 0,
      "m_rec_score_field_id": 32,
      "section_name": "Experience  ",
      "item_name": "Experience  ",
      "score_field_calculated_value": 6.675,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 713
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 32,
      "m_rec_score_field_id": 3125,
      "section_name": "Experience  ",
      "item_name": "As Teacher/Scientist/Subject Matter Specialist/Guest Faculty/Contractual Teacher/Part time Teacher/ RA/ RF/ SRF/ JRF/ TA/Farm Manager in any recognized University or Constituent/Affiliated Colleges of IGKV/ICAR/R & D organization of International/National level. State/Central Government Service",
      "score_field_calculated_value": 0,
      "Document_Status_Flag_Id": 2,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 673
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 32,
      "m_rec_score_field_id": 3125,
      "section_name": "Experience  ",
      "item_name": "As Teacher/Scientist/Subject Matter Specialist/Guest Faculty/Contractual Teacher/Part time Teacher/ RA/ RF/ SRF/ JRF/ TA/Farm Manager in any recognized University or Constituent/Affiliated Colleges of IGKV/ICAR/R & D organization of International/National level. State/Central Government Service",
      "score_field_calculated_value": 6.675,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 672
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 19,
      "m_rec_score_field_id": 20,
      "section_name": "Full Length Research paper/Review article ( in NAAS rated 3/peer reviewed journals)",
      "item_name": "First Author",
      "score_field_calculated_value": 1,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 707
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 3092,
      "m_rec_score_field_id": 3124,
      "section_name": "JRF/SRF of ICAR/CSIR/GATE/UGC etc. obtained through any examination/competition will only be considered",
      "item_name": "SRF",
      "score_field_calculated_value": 1,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 705
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 35,
      "m_rec_score_field_id": 36,
      "section_name": "NCC",
      "item_name": "B Certificate",
      "score_field_calculated_value": 2,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 715
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 38,
      "m_rec_score_field_id": 40,
      "section_name": "NSS",
      "item_name": "C Certificate",
      "score_field_calculated_value": 1,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 716
    },
    {
      "item_type": "Obtained Marks",
      "score_field_parent_id": 0,
      "m_rec_score_field_id": 34,
      "section_name": "Perfomance in Extra Curricular activities - NCC/NSS, Games and sports ,Cultural Activities",
      "item_name": "Perfomance in Extra Curricular activities - NCC/NSS, Games and sports ,Cultural Activities",
      "score_field_calculated_value": 2,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 714
    },
    {
      "item_type": "Obtained Marks",
      "score_field_parent_id": 0,
      "m_rec_score_field_id": 18,
      "section_name": "Publication Research/Extension",
      "item_name": "Publication Research/Extension",
      "score_field_calculated_value": 1.25,
      "Document_Status_Flag_Id": null,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 706
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 22,
      "m_rec_score_field_id": 24,
      "section_name": "Short Notes (In NAAS rated /peer reviewed Journals)",
      "item_name": "Co-Author",
      "score_field_calculated_value": 0.25,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 708
    },
    {
      "item_type": "Scoring by Committee",
      "score_field_parent_id": 3088,
      "m_rec_score_field_id": 3089,
      "section_name": "University medal at UG/PG/Ph.D",
      "item_name": "Gold Medal ",
      "score_field_calculated_value": 1,
      "Document_Status_Flag_Id": 1,
      "Document_Status_Remark_Id": null,
      "a_rec_app_score_field_detail_id": 704
    }
  ]
}